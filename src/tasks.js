import Router from 'koa-router';
import dataStore from 'nedb-promise';

export class Tasks {
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