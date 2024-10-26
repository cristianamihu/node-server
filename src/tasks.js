import Router from 'koa-router';
import dataStore from 'nedb-promise';

export class TaskStore {
    constructor({fileName, autoload}) {
        this.store = dataStore({fileName, autoload});
    }

    async find(props){
        return this.store.find(props);
    }

    async findOne(props) {
        return this.store.findOne(props);
    }

    async insert(task) {
        if (!task.name) { // validation
            throw new Error('Missing task name property')
        }
        return this.store.insert(task);
    };

    async update(props, task) {
        return this.store.update(props, task);
    }

    async remove(props) {
        return this.store.remove(props);
    }
}

const taskStore = new TaskStore({ filename: '/home/iliut/uni/An3/Sem1/PDM/node-server/db/tasks.json', autoload: true });

export const taskRouter = new Router();

taskRouter.get('/', async (ctx) => {
    const userId = ctx.state.user._id;
    ctx.response.body = await taskStore.find({ userId });
    ctx.response.status = 200; // ok
});

taskRouter.get('/:id', async (ctx) => {
    const userId = ctx.state.user._id;
    const task = await taskStore.findOne({ _id: ctx.params.id });
    const response = ctx.response;
    if (task) {
        if (task.userId === userId) {
            ctx.response.body = task;
            ctx.response.status = 200; // ok
        } else {
            ctx.response.status = 403; // forbidden
        }
    } else {
        ctx.response.status = 404; // not found
    }
});

const createTask = async (ctx, task, response) => {
    try {
        const userId = ctx.state.user._id;
        task.userId = userId;
        response.body = await taskStore.insert(task);
        response.status = 201; // created
        broadcast(userId, { type: 'created', payload: task });
    } catch (err) {
        response.body = { message: err.message };
        response.status = 400; // bad request
    }
};

taskRouter.post('/', async ctx => await createTask(ctx, ctx.request.body, ctx.response));

taskRouter.put('/:id', async ctx => {
    const task = ctx.request.body;
    const id = ctx.params.id;
    const taskId = task._id;
    const response = ctx.response;
    if (taskId && taskId !== id) {
        response.body = { message: 'Param id and body _id should be the same' };
        response.status = 400; // bad request
        return;
    }
    if (!taskId) {
        await createTask(ctx, task, response);
    } else {
        const userId = ctx.state.user._id;
        task.userId = userId;
        const updatedCount = await taskStore.update({ _id: id }, task);
        if (updatedCount === 1) {
            response.body = task;
            response.status = 200; // ok
            broadcast(userId, { type: 'updated', payload: task });
        } else {
            response.body = { message: 'Resource no longer exists' };
            response.status = 405; // method not allowed
        }
    }
});

taskRouter.del('/:id', async (ctx) => {
    const userId = ctx.state.user._id;
    const task = await taskStore.findOne({ _id: ctx.params.id });
    if (task && userId !== task.userId) {
        ctx.response.status = 403; // forbidden
    } else {
        await taskStore.remove({ _id: ctx.params.id });
        ctx.response.status = 204; // no content
    }
});