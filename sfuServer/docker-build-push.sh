#!/bin/bash

# Configuration - Modifiez ces valeurs selon votre registry Scaleway
REGISTRY="rg.fr-par.scw.cloud/sfu-server"  # Votre namespace Scaleway
VERSION="${1:-latest}"  # Utilisez le premier argument ou 'latest' par défaut

# Couleurs pour les logs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Building and Pushing SFU Server Images ===${NC}"
echo -e "Registry: ${REGISTRY}"
echo -e "Version: ${VERSION}"
echo ""

# Build Control Plane
echo -e "${GREEN}[1/4] Building Control Plane image...${NC}"
docker build --platform=linux/amd64 -f Dockerfile.controlplane -t ${REGISTRY}/controlplane:${VERSION} .
if [ $? -ne 0 ]; then
    echo "Error building Control Plane image"
    exit 1
fi

# Build SFU Server
echo -e "${GREEN}[2/4] Building SFU Server image...${NC}"
docker build --platform=linux/amd64 -f Dockerfile.sfu -t ${REGISTRY}/sfu:${VERSION} .
if [ $? -ne 0 ]; then
    echo "Error building SFU Server image"
    exit 1
fi

# Push Control Plane
echo -e "${GREEN}[3/4] Pushing Control Plane image...${NC}"
docker push ${REGISTRY}/controlplane:${VERSION}
if [ $? -ne 0 ]; then
    echo "Error pushing Control Plane image"
    exit 1
fi

# Push SFU Server
echo -e "${GREEN}[4/4] Pushing SFU Server image...${NC}"
docker push ${REGISTRY}/sfu:${VERSION}
if [ $? -ne 0 ]; then
    echo "Error pushing SFU Server image"
    exit 1
fi

echo ""
echo -e "${GREEN}✓ All images built and pushed successfully!${NC}"
echo ""
echo "Images pushed:"
echo "  - ${REGISTRY}/controlplane:${VERSION}"
echo "  - ${REGISTRY}/sfu:${VERSION}"
