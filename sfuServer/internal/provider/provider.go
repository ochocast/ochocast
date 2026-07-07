// Package provider defines the provider-neutral contract for creating,
// reading, tagging, and deleting on-demand SFU worker instances. The
// control-plane autoscaler depends only on this interface, so cloud providers
// stay swappable and the autoscaler is testable against a fake.
package provider

import "context"

// WorkerSpec is the provider-neutral request to create one on-demand SFU worker.
type WorkerSpec struct {
	Name     string   // instance name / hostname
	ImageTag string   // SFU image tag the worker will run (recorded on the worker record)
	UserData string   // cloud-init / bootstrap script injected before boot
	Tags     []string // billing + cleanup tags applied to the cloud resource
}

// Worker is the provider-neutral view of a provisioned worker instance.
type Worker struct {
	ProviderResourceID string            // cloud resource id (e.g. Scaleway Instance ID)
	PublicIP           string            // advertised public address; "" until the cloud assigns one
	State              string            // provider-native instance state (e.g. "running", "starting")
	Tags               []string          // tags currently on the resource
	Metadata           map[string]string // provider-specific extras (zone, ...)
}

// Provider is a cloud adapter that manages the lifecycle of SFU worker
// instances. Implementations translate these provider-neutral operations into a
// specific cloud API and never leak provider types to callers.
type Provider interface {
	// Name is the adapter id recorded on worker records (e.g. "scaleway").
	Name() string
	// CreateWorker provisions and boots one instance, returning its neutral view.
	CreateWorker(ctx context.Context, spec WorkerSpec) (Worker, error)
	// GetWorker reads the current state of a previously created instance.
	GetWorker(ctx context.Context, providerResourceID string) (Worker, error)
	// ListWorkers returns every instance currently carrying tag. Reconciliation
	// (task 4.4) and orphan cleanup (task 4.5) use it to compare the cloud
	// against persistent records.
	ListWorkers(ctx context.Context, tag string) ([]Worker, error)
	// TagWorker replaces the tags on an instance (billing/cleanup).
	TagWorker(ctx context.Context, providerResourceID string, tags []string) error
	// DeleteWorker destroys the instance and releases its billable IP/volume.
	DeleteWorker(ctx context.Context, providerResourceID string) error
}
