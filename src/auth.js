import Router from 'koa-router';
import jwt from 'jsonwebtoken';
import dataStore from "nedb-promise";
import { jwtConfig } from './utils.js';

export class UserStore {
    constructor({ filename, autoload }) {
        this.store = dataStore({ filename, autoload });
    }

    async findOne(props) {
        return this.store.findOne(props);
    }

    async insert(user) {
        return this.store.insert(user);
    };
}

const userStore = new UserStore({ filename: 'C:/Users/fgfhf/Documents/UBB - Computer science/third year/first semester/Programare pentru dispozitive mobile/Laborator/Ionic2/node-server/db/users.json', autoload: true });
//const userStore = new UserStore({ filename: './db/users.json', autoload: true });
console.log('userStore initialized with file:', userStore.store);

const createToken = (user) => {
    return jwt.sign({ username: user.username, _id: user._id }, jwtConfig.secret, { expiresIn: 60 * 60 * 60 });
};

export const authRouter = new Router();

authRouter.post('/signup', async (ctx) => {
    try {
        const user = ctx.request.body;
        await userStore.insert(user);
        ctx.response.body = { token: createToken(user) };
        ctx.response.status = 201; // created
    } catch (err) {
        ctx.response.body = { error: `${err.message} + test` };
        ctx.response.status = 400; // bad request
    }
});

authRouter.post('/login', async (ctx) => {
    const credentials = ctx.request.body;
    const user = await userStore.findOne({ username: credentials.username });
    if (user && credentials.password === user.password) {
        ctx.response.body = { token: createToken(user) };
        ctx.response.status = 201; // created
    } else {
        ctx.response.body = { error: 'Invalid credentials' };
        ctx.response.status = 400; // bad request
    }
});
