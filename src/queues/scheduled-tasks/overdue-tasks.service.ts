import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Task } from '../../modules/tasks/entities/task.entity';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';

@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);

  constructor(
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
  ) { }

  // TODO: Implement the overdue tasks checker
  // This method should run every hour and check for overdue tasks
  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTasks() {
    this.logger.debug('Checking for overdue tasks...');

    // TODO: Implement overdue tasks checking logic
    // 1. Find all tasks that are overdue (due date is in the past)
    // 2. Add them to the task processing queue
    // 3. Log the number of overdue tasks found

    // Example implementation (incomplete - to be implemented by candidates)
    const now = new Date();
    const overdueTasks = await this.tasksRepository.find({
      where: {
        dueDate: LessThan(now),
        status: TaskStatus.PENDING,
      },
    });

    this.logger.log(`Found ${overdueTasks.length} overdue tasks`);

    // Add tasks to the queue to be processed
    // TODO: Implement adding tasks to the queue

    this.logger.debug('Overdue tasks check completed');
  }
} 