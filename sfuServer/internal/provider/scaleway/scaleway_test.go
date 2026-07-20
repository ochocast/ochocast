package scaleway

import (
	"testing"

	"github.com/scaleway/scaleway-sdk-go/scw"

	"whip-server/internal/provider"
)

func TestCreateServerRequestAttachesConfiguredSecurityGroup(t *testing.T) {
	adapter := &Adapter{
		zone:            scw.ZoneFrPar1,
		projectID:       "project-id",
		commercialType:  "DEV1-S",
		imageID:         "image-id",
		securityGroupID: "security-group-id",
	}

	req := adapter.createServerRequest(provider.WorkerSpec{
		Name: "sfu-worker-1",
		Tags: []string{"sfu-worker", "cleanup-eligible"},
	})

	if req.SecurityGroup == nil || *req.SecurityGroup != "security-group-id" {
		t.Fatalf("security group = %v, want security-group-id", req.SecurityGroup)
	}
	if req.Image == nil || *req.Image != "image-id" {
		t.Fatalf("image = %v, want image-id", req.Image)
	}
	if req.DynamicIPRequired == nil || !*req.DynamicIPRequired {
		t.Fatal("dynamic IP must be requested")
	}
}

func TestNewRequiresSecurityGroup(t *testing.T) {
	_, err := New(Config{
		AccessKey: "access",
		SecretKey: "secret",
		ProjectID: "project",
		Zone:      "fr-par-1",
		ImageID:   "image",
	})
	if err == nil {
		t.Fatal("expected missing security group error")
	}
}
