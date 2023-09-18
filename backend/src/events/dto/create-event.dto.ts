export class CreateEventDto {
  name: string;
  description: string;
  category: string;
  tags: string[];
  date: Date;
  creator: bigint;
  private: boolean;
  imageSlug: string;
}
