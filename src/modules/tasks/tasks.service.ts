import { Injectable, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan, Not } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';


@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    private readonly dataSource: DataSource,

    @InjectQueue('task-processing')
    private taskQueue: Queue,
  ) { }

  async create(dto: CreateTaskDto): Promise<Task> {
    const task = this.tasksRepository.create(dto);
    const savedTask = await this.tasksRepository.save(task);

    await this.taskQueue.add('task-status-update', {
      taskId: savedTask.id,
      status: savedTask.status,
    });

    return savedTask;
  }

  async findAll(
    limit: number,
    offset: number,
    status?: string,
    priority?: string,
  ): Promise<{ data: Task[]; count: number }> {
    const qb = this.tasksRepository.createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user')
      .orderBy('task.createdAt', 'DESC')
      .skip(offset)
      .take(limit);

    if (status) qb.andWhere('task.status = :status', { status });
    if (priority) qb.andWhere('task.priority = :priority', { priority });

    const [data, count] = await qb.getManyAndCount();
    return { data, count };
  }

  async findOne(id: string): Promise<Task> {
    const task = await this.tasksRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return task;
  }

  async update(id: string, dto: UpdateTaskDto): Promise<Task> {
    const task = await this.findOne(id);
    const originalStatus = task.status;

    Object.assign(task, dto);
    const updatedTask = await this.tasksRepository.save(task);

    if (originalStatus !== updatedTask.status) {
      await this.taskQueue.add('task-status-update', {
        taskId: updatedTask.id,
        status: updatedTask.status,
      });
    }

    return updatedTask;
  }

  async remove(id: string): Promise<void> {
    const task = await this.findOne(id);
    await this.tasksRepository.remove(task);
  }

  async getStatistics() {
    const tasks = await this.tasksRepository.find();
    return {
      total: tasks.length,
      completed: tasks.filter(t => t.status === TaskStatus.COMPLETED).length,
      inProgress: tasks.filter(t => t.status === TaskStatus.IN_PROGRESS).length,
      pending: tasks.filter(t => t.status === TaskStatus.PENDING).length,
      highPriority: tasks.filter(t => t.priority === TaskPriority.HIGH).length,
    };
  }

  async batchProcessTasks(taskIds: string[], action: 'complete' | 'delete') {
    const results = [];

    for (const taskId of taskIds) {
      try {
        let result;

        if (action === 'complete') {
          result = await this.update(taskId, { status: TaskStatus.COMPLETED });
        } else if (action === 'delete') {
          await this.remove(taskId);
          result = { deleted: true };
        } else {
          throw new HttpException(`Unknown action: ${action}`, HttpStatus.BAD_REQUEST);
        }

        results.push({ taskId, success: true, result });
      } catch (error) {
        results.push({
          taskId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  async updateStatusWithTransaction(taskId: string, status: string): Promise<Task> {
    return await this.dataSource.transaction(async (manager) => {
      const task: any = await manager.findOne(Task, { where: { id: taskId } });

      if (!task) {
        throw new Error(`Task with id ${taskId} not found`);
      }

      task.status = status;
      return await manager.save(task);
    });
  }

  async updateStatus(id: string, status: TaskStatus): Promise<Task> {
    const task = await this.findOne(id);
    task.status = status;
    return this.tasksRepository.save(task);
  }

  async getOverdueTasks(): Promise<Task[]> {
    const now = new Date();

    return await this.tasksRepository.find({
      where: {
        dueDate: LessThan(now),
        status: Not(TaskStatus.COMPLETED),
      },
      relations: ['user'],
    });
  }

  async sendOverdueTaskNotifications(tasks: Task[]): Promise<void> {
    for (const task of tasks) {
      const user = task.user;
      // Replace this with real notification logic (email, push, etc.)
      console.log(`🔔 Notify ${user.email} about overdue task: ${task.title}`);
    }
  }

}
