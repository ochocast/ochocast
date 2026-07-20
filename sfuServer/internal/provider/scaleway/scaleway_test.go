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
	root := req.Volumes["0"]
	if root == nil {
		t.Fatal("root volume must be configured")
	}
	if root.Size == nil || *root.Size != scw.GB*10 {
		t.Fatalf("root volume size = %v, want 10 GB", root.Size)
	}
	if root.VolumeType != "l_ssd" {
		t.Fatalf("root volume type = %q, want l_ssd", root.VolumeType)
	}
	if root.Boot == nil || !*root.Boot {
		t.Fatal("root volume must be bootable")
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
