# CI/CD contract

`ochocast` owns application code and application CI only.

`ffmpeg-serverless.yml` validates the FFmpeg HTTP worker and its backend contract,
including PostgreSQL concurrency and real FFmpeg tests, then builds an amd64 image.
PRs do not publish; pushes to `main` and explicit manual publication use
`vars.FFMPEG_IMAGE_REPOSITORY` plus the existing Scaleway registry credentials.
The immutable tag and digest are reported for deployment through ops-architecture-lab.
The existing frontend/backend GitOps promotion does not deploy this worker;
the serverless infrastructure must promote the worker's same digest separately.
See `ffmpegServer/SERVERLESS.md` for the environment and trigger contract.

The GitOps promotion workflow:

1. validates the frontend and backend;
2. builds Docker images;
3. pushes immutable `sha-<commit>` image tags to Scaleway Registry;
4. opens a pull request in `ochocast/ops-architecture-lab` to promote those image tags.

This repository must not contain kubeconfigs, ArgoCD tokens, Terraform credentials, or direct deployment steps. Kubernetes manifests, Helm values, runtime secrets, ArgoCD Applications, and infrastructure as code stay in `ops-architecture-lab`.

The serverless production path is kept separately in `serverless-prod.yml` while Kubernetes production remains experimental. It deploys on pushes to the `prod` branch and can also be triggered manually.

Required GitHub configuration:

- secrets: `SCW_REGISTRY`, `SCW_REG_USER`, `SCW_SECRET_KEY`
- secret: `OPS_REPO_TOKEN` with permission to create branches and pull requests in `ochocast/ops-architecture-lab`
- optional variable: `OPS_REPO_BASE_BRANCH`, defaulting to `main`
