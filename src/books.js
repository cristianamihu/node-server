import Router from 'koa-router';
import dataStore from 'nedb-promise';
import {broadcast} from "./wss.js";

export class BookStore {
    constructor({ filename, autoload }) {
        this.store = dataStore({ filename, autoload });
    }

    async find(props){
        return this.store.find(props);
    }

    async findOne(props) {
        return this.store.findOne(props);
    }

    async insert(book) {
        console.log('Inserting book:', book); // Log the book to be inserted
        if (!book.title) {
            throw new Error('Missing book title property');
        }
        try {
            const result = await this.store.insert(book);
            console.log('Book inserted successfully:', result); // Log the result
            return result;
        } catch (err) {
            console.error('Error inserting book:', err); // Log the error
            throw err; // Re-throw to handle it in the calling function
        }
    }

    async update(props, book) {
        return this.store.update(props, book);
    }

    async remove(props) {
        return this.store.remove(props);
    }
}

const bookStore = new BookStore({ filename: 'C:/Users/fgfhf/Documents/UBB - Computer science/third year/first semester/Programare pentru dispozitive mobile/Laborator/Ionic2/node-server/db/books.json', autoload: true });
//const bookStore = new BookStore({ filename: './db/books.json', autoload: true });
console.log('BookStore initialized with file:', bookStore.store);

export const bookRouter = new Router();

bookRouter.get('/', async (ctx) => {
    const userId = ctx.state.user._id;
    ctx.response.body = await bookStore.find({ userId });
    ctx.response.status = 200; // ok
});


bookRouter.get('/count', async (ctx) => {
    try {
        const userId = ctx.state.user._id;
        const bookCount = await bookStore.store.count({ userId });
        ctx.response.body = { count: bookCount };
        ctx.response.status = 200; // OK
    } catch (error) {
        ctx.response.status = 500;
        ctx.response.body = { error: 'Internal Server Error' };
        console.error('Failed to get book count:', error);
    }
});


bookRouter.get('/from/:i/:j', async (ctx) => {
    const userId = ctx.state.user._id;
    const i = parseInt(ctx.params.i, 10);
    const j = parseInt(ctx.params.j, 10);

    if (isNaN(i) || isNaN(j) || i < 0 || j <= i) {
        ctx.response.status = 400; // bad request
        ctx.response.body = { message: 'Invalid range parameters' };
        return;
    }

    try {
        const books = await bookStore.store
            .cfind({ userId }) // `cfind` enables cursor chaining in nedb-promise
            .skip(i)
            .limit(j - i)
            .exec(); // `.exec()` triggers the execution of the cursor chain
        ctx.response.body = books;
        ctx.response.status = 200; // ok
    } catch (err) {
        console.error('Error retrieving books:', err);
        ctx.response.status = 500; // internal server error
        ctx.response.body = { message: 'An error occurred while fetching books' };
    }
});


bookRouter.get('/liked/:str', async (ctx) => {
    const userId = ctx.state.user._id;
    const str = ctx.params.str;  // Ensure we're correctly fetching str from ctx.params

    try {
        if (str === "yes") {
            // Return liked books
            ctx.response.body = await bookStore.find({ userId, liked: true });
            ctx.response.status = 200; // ok
        } else if (str === "no") {
            // Return incomplete books
            ctx.response.body = await bookStore.find({ userId, liked: false });
            ctx.response.status = 200; // ok
        } else {
            // Handle invalid input
            ctx.response.status = 400; // bad request
            ctx.response.body = { message: 'Invalid parameter. Use "yes" for liked books or "no" for incomplete books.' };
        }
    } catch (err) {
        console.error('Error retrieving books:', err);
        ctx.response.status = 500; // internal server error
        ctx.response.body = { message: 'An error occurred while fetching books' };
    }
});


bookRouter.get('/:id', async (ctx) => {
    const userId = ctx.state.user._id;
    const book = await bookStore.findOne({ _id: ctx.params.id });
    const response = ctx.response;
    if (book) {
        if (book.userId === userId) {
            ctx.response.body = book;
            ctx.response.status = 200; // ok
        } else {
            ctx.response.status = 403; // forbidden
        }
    } else {
        ctx.response.status = 404; // not found
    }
});

const createBook = async (ctx, book, response) => {
    try {
        const userId = ctx.state.user._id; // Ensure this is set correctly
        book.userId = userId;
        response.body = await bookStore.insert(book);
        response.status = 201; // created
        broadcast(userId, { type: 'created', payload: book });
    } catch (err) {
        console.error('Error creating book:', err);
        response.body = { message: err.message };
        response.status = 400; // bad request
    }
};


bookRouter.post('/', async ctx => await createBook(ctx, ctx.request.body, ctx.response));

bookRouter.post('/array', async ctx => {
    const books = ctx.request.body;
    if (Array.isArray(books)) {
        const results = await Promise.all(books.map(book => createBook(ctx, book, ctx.response)));
        ctx.response.body = results;
        ctx.response.status = 201;
    } else {
        ctx.throw(400, 'Expected an array of books');
    }
});


bookRouter.put('/:id', async ctx => {
    const book = ctx.request.body;
    const id = ctx.params.id;
    const bookId = book._id;
    const response = ctx.response;
    if (bookId && bookId !== id) {
        response.body = { message: 'Param id and body _id should be the same' };
        response.status = 400; // bad request
        return;
    }

    if (!bookId) {
        await createBook(ctx, book, response);
    } else {
        const userId = ctx.state.user._id;
        book.userId = userId;
        const updatedCount = await bookStore.update({ _id: id }, book);
        
        if (updatedCount === 1) {
            response.body = book;
            response.status = 200; // ok
            broadcast(userId, { type: 'updated', payload: book });
        } else {
            response.body = { message: 'Resource no longer exists' };
            response.status = 405; // method not allowed
        }
    }
});

bookRouter.del('/:id', async (ctx) => {
    const userId = ctx.state.user._id;
    const book = await bookStore.findOne({ _id: ctx.params.id });

    // Ensure the book exists and belongs to the user
    if (!book) {
        ctx.response.status = 404; // not found
        return;
    }

    if (book.userId !== userId) {
        ctx.response.status = 403; // forbidden
        return;
    }

    // Proceed to remove the book
    await bookStore.remove({ _id: ctx.params.id });
    ctx.response.status = 204; // no content

    // Broadcast the deletion
    broadcast(userId, { type: 'deleted', payload: { _id: book._id } });
});
