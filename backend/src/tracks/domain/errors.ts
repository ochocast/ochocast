// Errors of the tracks domain. Controllers translate them to HTTP statuses, so the domain
// stays free of framework imports.
export class TrackNotFoundError extends Error {
  constructor(trackId: string) {
    super(`Track ${trackId} not found`);
    this.name = 'TrackNotFoundError';
  }
}

export class NotSignedInError extends Error {
  constructor(message = 'Sign in to stream on this track') {
    super(message);
    this.name = 'NotSignedInError';
  }
}

export class NotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotAllowedError';
  }
}

// The SFU control plane failed, timed out or refused the backend's credentials.
export class LiveRoomUnavailableError extends Error {
  constructor(
    message: string,
    readonly timedOut = false,
  ) {
    super(message);
    this.name = 'LiveRoomUnavailableError';
  }
}
