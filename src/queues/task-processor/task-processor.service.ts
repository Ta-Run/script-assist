import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TasksService } from '../../modules/tasks/tasks.service';

@Injectable()
@Processor('task-processing')
export class TaskProcessorService extends WorkerHost {
  private readonly logger = new Logger(TaskProcessorService.name);

  private readonly VALID_STATUSES = ['pending', 'in_progress', 'completed', 'failed'];

  constructor(private readonly tasksService: TasksService) {
    super();
  }

  async process(job: Job): Promise<any> {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);

    try {
      switch (job.name) {
        case 'task-status-update':
          return await this.handleStatusUpdate(job);
        case 'overdue-tasks-notification':
          return await this.handleOverdueTasks(job);
        default:
          this.logger.warn(`Unknown job type received: ${job.name}`);
          return { success: false, error: 'Unknown job type' };
      }
    } catch (error: any) {
      this.logger.error(`Job ${job.id} failed: ${error.message}`, error.stack);
      // Let BullMQ retry automatically if configured
      throw error;
    }
  }

  private async handleStatusUpdate(job: Job) {
    const { taskId, status } = job.data;

    if (!taskId || !status) {
      this.logger.warn(`Missing required data for status update: ${JSON.stringify(job.data)}`);
      return { success: false, error: 'Missing taskId or status' };
    }

    if (!this.VALID_STATUSES.includes(status)) {
      this.logger.warn(`Invalid status value "${status}" for taskId ${taskId}`);
      return { success: false, error: 'Invalid status value' };
    }

    try {
      const task = await this.tasksService.updateStatusWithTransaction(taskId, status);

      return {
        success: true,
        taskId: task.id,
        newStatus: task.status,
      };
    } catch (err: any) {
      this.logger.error(`Failed to update task status. taskId: ${taskId}, status: ${status}`, err.stack);
      throw err;
    }
  }

  private async handleOverdueTasks(job: Job) {
    this.logger.debug('Fetching overdue tasks...');

    const tasks = await this.tasksService.getOverdueTasks();

    if (tasks.length === 0) {
      this.logger.log('No overdue tasks found.');
      return { success: true, message: 'No overdue tasks to process' };
    }

    this.logger.log(`Found ${tasks.length} overdue tasks. Sending notifications...`);

    await this.tasksService.sendOverdueTaskNotifications(tasks);

    return {
      success: true,
      processed: tasks.length,
      message: 'Overdue task notifications sent',
    };
  }

}
