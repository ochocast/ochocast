// Package scaleway implements provider.Provider against the Scaleway Instance
// API. It runs only inside the sfu-controlplane; workers, frontend, and backend
// never import it and never receive Scaleway credentials.
package scaleway

import (
	"context"
	"fmt"
	"strings"

	instance "github.com/scaleway/scaleway-sdk-go/api/instance/v1"
	"github.com/scaleway/scaleway-sdk-go/scw"

	"whip-server/internal/provider"
)

// Config carries the static Scaleway settings promoted via GitOps (task 7.3)
// plus the credential injected from a Kubernetes Secret at runtime (task 7.4).
type Config struct {
	AccessKey      string // SCW_ACCESS_KEY
	SecretKey      string // SCW_SECRET_KEY
	ProjectID      string // SCW_DEFAULT_PROJECT_ID
	Zone           string // e.g. "fr-par-1"
	CommercialType string // worker Instance type, defaults to DEV1-S
	ImageID        string // Docker-capable base image id or label
}

// Adapter is the Scaleway implementation of provider.Provider.
type Adapter struct {
	api            *instance.API
	zone           scw.Zone
	projectID      string
	commercialType string
	imageID        string
}

var _ provider.Provider = (*Adapter)(nil)

// New builds a Scaleway adapter. Credentials come from the runtime Secret; the
// zone/type/image come from promoted configuration.
func New(cfg Config) (*Adapter, error) {
	if cfg.AccessKey == "" || cfg.SecretKey == "" || cfg.ProjectID == "" {
		return nil, fmt.Errorf("scaleway: access key, secret key and project id are required")
	}
	if cfg.ImageID == "" {
		return nil, fmt.Errorf("scaleway: image id is required")
	}
	zone, err := scw.ParseZone(cfg.Zone)
	if err != nil {
		return nil, fmt.Errorf("scaleway: invalid zone %q: %w", cfg.Zone, err)
	}
	client, err := scw.NewClient(
		scw.WithAuth(cfg.AccessKey, cfg.SecretKey),
		scw.WithDefaultZone(zone),
		scw.WithDefaultProjectID(cfg.ProjectID),
	)
	if err != nil {
		return nil, fmt.Errorf("scaleway: client: %w", err)
	}
	ct := cfg.CommercialType
	if ct == "" {
		ct = "DEV1-S"
	}
	return &Adapter{
		api:            instance.NewAPI(client),
		zone:           zone,
		projectID:      cfg.ProjectID,
		commercialType: ct,
		imageID:        cfg.ImageID,
	}, nil
}

func (a *Adapter) Name() string { return "scaleway" }

// CreateWorker creates a dynamic-IP Instance, injects cloud-init, and powers it
// on. If bootstrap or boot fails the half-created Instance is terminated so it
// never becomes an orphaned billable resource.
func (a *Adapter) CreateWorker(ctx context.Context, spec provider.WorkerSpec) (provider.Worker, error) {
	res, err := a.api.CreateServer(&instance.CreateServerRequest{
		Zone:              a.zone,
		Name:              spec.Name,
		CommercialType:    a.commercialType,
		Image:             scw.StringPtr(a.imageID),
		DynamicIPRequired: scw.BoolPtr(true), // dynamic IP is released on terminate
		Tags:              spec.Tags,
		Project:           scw.StringPtr(a.projectID),
	}, scw.WithContext(ctx))
	if err != nil {
		return provider.Worker{}, fmt.Errorf("scaleway: create server: %w", err)
	}
	srv := res.Server

	if spec.UserData != "" {
		if err := a.api.SetServerUserData(&instance.SetServerUserDataRequest{
			Zone:     a.zone,
			ServerID: srv.ID,
			Key:      "cloud-init",
			Content:  strings.NewReader(spec.UserData),
		}, scw.WithContext(ctx)); err != nil {
			_ = a.DeleteWorker(ctx, srv.ID)
			return provider.Worker{}, fmt.Errorf("scaleway: set user data: %w", err)
		}
	}

	if _, err := a.api.ServerAction(&instance.ServerActionRequest{
		Zone:     a.zone,
		ServerID: srv.ID,
		Action:   instance.ServerActionPoweron,
	}, scw.WithContext(ctx)); err != nil {
		_ = a.DeleteWorker(ctx, srv.ID)
		return provider.Worker{}, fmt.Errorf("scaleway: power on server %s: %w", srv.ID, err)
	}

	return toWorker(srv), nil
}

func (a *Adapter) GetWorker(ctx context.Context, id string) (provider.Worker, error) {
	res, err := a.api.GetServer(&instance.GetServerRequest{Zone: a.zone, ServerID: id}, scw.WithContext(ctx))
	if err != nil {
		return provider.Worker{}, fmt.Errorf("scaleway: get server %s: %w", id, err)
	}
	return toWorker(res.Server), nil
}

func (a *Adapter) TagWorker(ctx context.Context, id string, tags []string) error {
	if _, err := a.api.UpdateServer(&instance.UpdateServerRequest{
		Zone:     a.zone,
		ServerID: id,
		Tags:     &tags,
	}, scw.WithContext(ctx)); err != nil {
		return fmt.Errorf("scaleway: tag server %s: %w", id, err)
	}
	return nil
}

// DeleteWorker terminates the Instance. The terminate action deletes the server
// and releases its attached local volumes and dynamic public IP — the billable
// resources we must not leak (task 8.5).
// ponytail: non-blocking terminate; reconciliation (4.4) confirms it's gone
// rather than blocking here on a poll.
func (a *Adapter) DeleteWorker(ctx context.Context, id string) error {
	if _, err := a.api.ServerAction(&instance.ServerActionRequest{
		Zone:     a.zone,
		ServerID: id,
		Action:   instance.ServerActionTerminate,
	}, scw.WithContext(ctx)); err != nil {
		return fmt.Errorf("scaleway: terminate server %s: %w", id, err)
	}
	return nil
}

// toWorker maps a Scaleway Server onto the provider-neutral view.
func toWorker(s *instance.Server) provider.Worker {
	w := provider.Worker{
		ProviderResourceID: s.ID,
		State:              string(s.State),
		Tags:               s.Tags,
		Metadata:           map[string]string{"zone": s.Zone.String()},
	}
	for _, ip := range s.PublicIPs {
		if ip != nil && ip.Address != nil {
			w.PublicIP = ip.Address.String()
			break
		}
	}
	return w
}
