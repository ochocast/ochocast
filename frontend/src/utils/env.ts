function getEnv(key: string, defaultValue?: string): string {
  // @ts-expect-error windows doesn't have _env_. Is dynamically injected to a project with a script
  const envs = window._env_;
  if (envs && envs[key] !== undefined && envs[key] !== '') {
    return envs[key];
  }

  const env = process.env[key] || defaultValue;

  return env || '';
}

export default getEnv;
