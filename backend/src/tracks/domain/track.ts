export class TrackObject {
  constructor(
    public id: string,
    public name: string,
    public description: string,
    public keywords: string[],
    public streamKey: string,
    public closed: boolean = false,
    public event: string,
    public createdAt: Date,
  ) {}
}
