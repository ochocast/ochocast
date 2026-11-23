// How the backend reaches the SFU control plane. CONTROL_PLANE_URL can be an internal
// address; SFU_CONTROL_TOKEN (shared with the control plane, the workers and the recorder)
// unlocks its internal endpoints: room creation, room keys, recorder discovery.
export const controlPlaneUrl = (): string =>
  (process.env.CONTROL_PLANE_URL || 'http://localhost:8090').replace(/\/$/, '');

export const controlPlaneHeaders = (): Record<string, string> => {
  const token = process.env.SFU_CONTROL_TOKEN;
  return token ? { 'X-SFU-Control-Token': token } : {};
};
