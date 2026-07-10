import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from './entities/event.entity';
import { CreateEventDto } from './dto/create-event.dto';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventsRepository: Repository<Event>,
  ) {}

  async create(dto: CreateEventDto): Promise<Event> {
    const event = this.eventsRepository.create({
      name: dto.name,
      description: dto.description ?? null,
      venue: dto.venue,
      eventDate: new Date(dto.eventDate),
      totalTickets: dto.totalTickets,
      availableTickets: dto.totalTickets, // all tickets available on creation
      price: dto.price.toFixed(2),
    });
    return this.eventsRepository.save(event);
  }

  // Endpoint designed to be the "hot" read path, which in Phase 3
  // will be backed by Redis as a read cache.
  async findAll(): Promise<Event[]> {
    return this.eventsRepository.find({
      order: { eventDate: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Event> {
    const event = await this.eventsRepository.findOne({ where: { id } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }
}
