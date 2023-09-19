export class CreateEventDto {
  name: string;
  description: string;
  category: string;
  tags: string[];
  date: Date;
  creator: bigint;
  isPrivate: boolean;
  imageSlug: string;
}
