import Router from 'koa-router';
import dataStore from 'nedb-promise';
import {broadcast} from "./wss.js";

export class TaskStore {
    constructor({ filename, autoload }) {
        this.store = dataStore({ filename, autoload });
    }

    async find(props){
        return this.store.find(props);
    }

    async findOne(props) {
        return this.store.findOne(props);
    }

    async insert(task) {
        console.log('Inserting task:', task); // Log the task to be inserted
        if (!task.name) {
            throw new Error('Missing task name property');
        }
        try {
            const result = await this.store.insert(task);
            console.log('Task inserted successfully:', result); // Log the result
            return result;
        } catch (err) {
            console.error('Error inserting task:', err); // Log the error
            throw err; // Re-throw to handle it in the calling function
        }
    }

    async update(props, task) {
        return this.store.update(props, task);
    }

    async remove(props) {
        return this.store.remove(props);
    }
}

const taskStore = new TaskStore({ filename: '/home/iliut/uni/An3/Sem1/PDM/node-server/db/tasks.json', autoload: true});
console.log('TaskStore initialized with file:', taskStore.store);

export const taskRouter = new Router();

taskRouter.get('/', async (ctx) => {
    const userId = ctx.state.user._id;
    ctx.response.body = await taskStore.find({ userId });
    ctx.response.status = 200; // ok
});

taskRouter.get('/count', async (ctx) => {
    try {
        const userId = ctx.state.user._id;

        const taskCount = await taskStore.store.count({ userId });


        ctx.response.body = { count: taskCount };
        ctx.response.status = 200; // OK
    } catch (error) {
        ctx.response.status = 500;
        ctx.response.body = { error: 'Internal Server Error' };
        console.error('Failed to get task count:', error);
    }
});


taskRouter.get('/from/:i/:j', async (ctx) => {
    const userId = ctx.state.user._id;
    const i = parseInt(ctx.params.i, 10);
    const j = parseInt(ctx.params.j, 10);

    if (isNaN(i) || isNaN(j) || i < 0 || j <= i) {
        ctx.response.status = 400; // bad request
        ctx.response.body = { message: 'Invalid range parameters' };
        return;
    }

    try {
        const tasks = await taskStore.store
            .cfind({ userId }) // `cfind` enables cursor chaining in nedb-promise
            .skip(i)
            .limit(j - i)
            .exec(); // `.exec()` triggers the execution of the cursor chain

        ctx.response.body = tasks;
        ctx.response.status = 200; // ok
    } catch (err) {
        console.error('Error retrieving tasks:', err);
        ctx.response.status = 500; // internal server error
        ctx.response.body = { message: 'An error occurred while fetching tasks' };
    }
});

taskRouter.get('/completed/:str', async (ctx) => {
    const userId = ctx.state.user._id;
    const str = ctx.params.str;  // Ensure we're correctly fetching str from ctx.params

    try {
        if (str === "yes") {
            // Return completed tasks
            ctx.response.body = await taskStore.find({ userId, completed: true });
            ctx.response.status = 200; // ok
        } else if (str === "no") {
            // Return incomplete tasks
            ctx.response.body = await taskStore.find({ userId, completed: false });
            ctx.response.status = 200; // ok
        } else {
            // Handle invalid input
            ctx.response.status = 400; // bad request
            ctx.response.body = { message: 'Invalid parameter. Use "yes" for completed tasks or "no" for incomplete tasks.' };
        }
    } catch (err) {
        console.error('Error retrieving tasks:', err);
        ctx.response.status = 500; // internal server error
        ctx.response.body = { message: 'An error occurred while fetching tasks' };
    }
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
        const userId = ctx.state.user._id; // Ensure this is set correctly
        task.userId = userId;
        response.body = await taskStore.insert(task);
        response.status = 201; // created
        broadcast(userId, { type: 'created', payload: task });
    } catch (err) {
        console.error('Error creating task:', err);
        response.body = { message: err.message };
        response.status = 400; // bad request
    }
};


taskRouter.post('/', async ctx => await createTask(ctx, ctx.request.body, ctx.response));

taskRouter.post('/array', async ctx => {
    const tasks = ctx.request.body;
    if (Array.isArray(tasks)) {
        const results = await Promise.all(tasks.map(task => createTask(ctx, task, ctx.response)));
        ctx.response.body = results;
        ctx.response.status = 201;
    } else {
        ctx.throw(400, 'Expected an array of tasks');
    }
});


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

    // Ensure the task exists and belongs to the user
    if (!task) {
        ctx.response.status = 404; // not found
        return;
    }

    if (task.userId !== userId) {
        ctx.response.status = 403; // forbidden
        return;
    }

    // Proceed to remove the task
    await taskStore.remove({ _id: ctx.params.id });
    ctx.response.status = 204; // no content

    // Broadcast the deletion
    broadcast(userId, { type: 'deleted', payload: { _id: task._id } });
});
