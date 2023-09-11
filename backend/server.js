const express = require('express');
const app = express();

const mongoose = require('./db/mongoose');
const Product = require('./db/models/productModel');
const User = require('./db/models/userModel');
const Order = require('./db/models/orderModel');

const jwt = require('jsonwebtoken');
const { rest } = require('lodash');

const ADMIN_ID = '64fc3739dfabb3c872140294';

// MIDDLEWARE START

app.use(express.json());

// to fix the CORS problem
app.use(function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-access-token, x-refresh-token');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH');
        return res.status(200).json({});
    };
    res.header('Access-Control-Expose-Headers', 'x-access-token, x-refresh-token');
    next();
});


let authenticate = (req, res, next) => {
    let token = req.header('x-access-token');

    jwt.verify(token, User.getJWTSecret(), (err, decoded) => {
        if(err) {
            res.status(401).send(err);
        }
        else {
            req.user_id = decoded._id;
            next();
        }
    })
}


// verify refresh token middleware (which will be verifying the session)
let verifySession = (req, res, next) => {
    let refreshToken = req.header('x-refresh-token');
    let _id = req.header('_id');

    User.findByIdAndToken(_id, refreshToken).then((user) => {
        if(!user) {
            return Promise.reject({
                'error': 'User not found. Make sure that the refresh token and user id are correct'
            });
        }

        // if the code reaches here - the user was found
        // therefore the refresh token exists in the database - but we still have to check if it has expired or not
        req.user_id = user._id;
        req.userObject = user;
        req.refreshToken = refreshToken;

        user.sessions.forEach((session) => {
            if (session.token === refreshToken) {
                // check if the session has expired
                if(User.hasRefreshTokenExpired(session.expiresAt) === false) {
                    // refresh token has not expired
                    isSessionValid = true;
                }
            }
        });

        if(isSessionValid) {
            // the session is valid - call next() to continue with processing this web request
            next();
        } else {
            // the session is not valid
            return Promise.reject({
                'error': 'Refresh token has expired or the session is invalid'
            })
        }
    }).catch((e) => {
        res.status(401).send(e);
    })
}

// MIDDLEWARE END


// get products from database
app.get('/read', async (request, response) => {
    try {
        const {
            limit, 
            skip, 
            sort, 
            by, 
            ...searchQuery
        } = request.query;

        // Basic Pagination
        const limitVal = parseInt(limit) || 6;
        const skipVal = parseInt(skip) || 0;

        // Sorting
        const sortVal = sort === 'desc' ? -1 : 1;
        const sortBy = by || 'name';
        
        // If other search query parameters are present (searching)
        if (Object.keys(searchQuery).length > 0) {
            const allowableSearchFields = ["name", "quantity", "price", "uniqueKey"];

            // Build a new safe search query object with only the allowed fields
            let validSearchQuery = {};
            for (let field of allowableSearchFields) {
                if (searchQuery[field]) {
                    validSearchQuery[field] = searchQuery[field];
                }
            }

            if(validSearchQuery.name) {
                validSearchQuery.name = validSearchQuery.name.toLowerCase();
            }
            const product = await Product.find(validSearchQuery).sort({ [sortBy]: sortVal });
            if (!product) {
                return response.status(404).json({ message: 'Product not found' });
            }
            return response.status(200).json(product);
        }

        // Get all products with pagination and optional sorting
        const products = await Product.find({})
            .limit(limitVal)
            .skip(skipVal)
            .sort({ [sortBy]: sortVal });

        response.status(200).json(products);
    } catch (error) {
        response.status(500).json({ message: error.message });
    }
});

app.post('/create', authenticate, async(request, response) => {
    if(request.user_id !== ADMIN_ID) {
        return response.status(401).json({ message: 'Unauthorized'});
    }
    try {
        request.body.name = request.body.name.toLowerCase();

        if (await Product.findOne({ name: request.body.name })) {
            return response.status(409).json({ message: 'Product already exists'});
        }
        
        const product = await Product.create(request.body);
        response.status(200).json(product);

    } catch (error) {
        response.status(500).json({ message: error.message});
    }
});

// update a product
app.put('/update/:id', authenticate, async(request, response) => {
    if(request.user_id !== ADMIN_ID) {
        return response.status(401).json({ message: 'Unauthorized'});
    }

    try {
        const product = await Product.findByIdAndUpdate(request.params.id, request.body);
        if(!product) {
            return response.status(404).json({ message: 'Product not found'});
        }
        const updatedProduct = await Product.findById(request.params.id);
        response.status(200).json(updatedProduct);
    }
    catch (error) {
        response.status(500).json({ message: error.message});
    }
});

// delete products
app.delete('/delete/:id', authenticate, async(request, response) => {
    if(request.user_id !== ADMIN_ID) {
        return response.status(401).json({ message: 'Unauthorized'});
    }

    try {
        if(request.params.id) {
            const product = await Product.findByIdAndDelete(request.params.id);
            if(!product) {
                return response.status(404).json({ message: 'Product not found'});
            }
            response.status(200).json(product);
        }
        else {
            const products = await Product.deleteMany({});
            response.status(200).json(products);
        }
    }
    catch (error) {
        response.status(500).json({ message: error.message});
    }
});



// user routes

// sign up
app.post('/users', async(request, response) => {
    let body = request.body;
    let newUser = new User(body);

    newUser.save().then(() => {
        return newUser.createSession();
    }).then((refreshToken) => {
        // Session created successfully - refreshToken returned.
        // now we generate an access auth token for the user
        return newUser.generateAccessAuthToken().then((accessToken) => {
            // access auth token generated successfully, now we return an object containing the auth tokens
            return { accessToken, refreshToken }
        })
    }).then((authToken) => {
        // Now we construct and send the response to the user with their auth tokens in the header and the user object in the body
        response
            .header('x-refresh-token', authToken.refreshToken)
            .header('x-access-token', authToken.accessToken)
            .send(newUser);
    }).catch((e) => {
        response.status(400).send(e);    
    })
});

// login
app.post('/users/login', (request, response) => {
    let email = request.body.email;
    let password = request.body.password;

    User.findByCredentials(email, password).then((user) => {
        return user.createSession().then((refreshToken) => {
            // Session created successfully - refreshToken returned.
            // now we generate an access auth token for the user
            return user.generateAccessAuthToken().then((accessToken) => {
                // access auth token generated successfully, now we return an object containing the auth tokens
                return { accessToken, refreshToken }
            })
        }).then((authTokens) => {
            // Now we construct and send the response to the user with their auth tokens in the header and the user object in the body
            response
                .header('x-refresh-token', authTokens.refreshToken)
                .header('x-access-token', authTokens.accessToken)
                .send(user);
        })
    }).catch((e) => {
        response.status(400).send(e);    
    })
});

// generate and return an access token
app.get('/users/me/access-token', verifySession, (request, response) => {
    // we know that the user/caller is authenticated and we have the user_id and user object available to us
    request.userObject.generateAccessAuthToken().then((accessToken) => {
        response.header('x-access-token', accessToken).send({ accessToken });
    }).catch((e) => {
        response.status(400).send(e);
    })
});

// delete a user by ID
app.delete('/users/:id', authenticate, async(request, response) => {
    if(request.user_id !== request.params.id) {
        return response.status(401).json({ message: 'Unauthorized'});
    }

    try {
        const user = await User.findByIdAndDelete(request.params.id);
        if(!user) {
            return response.status(404).json({ message: 'User not found'});
        }
        response.status(200).json(user);
    }
    catch (error) {
        response.status(500).json({ message: error.message});
    }
});



// order routes

// create orders
app.post('/orders', authenticate, async(request, response) => {
    if(request.user_id !== request.body.user) {
        response.status(401).json({ message: 'Unauthorized'});
    }
    try {
        const { productId, ...rest } = request.body;
        const order = await Order.create(rest);

        await adjustProductQuantities(productId, rest.productQuantity);

        response.status(200).json(order);
    } catch (error) {
        response.status(500).json({ message: error.message});
    }
});

// get orders
app.get('/orders', authenticate, async(request, response) => {


    const {limit, skip, ...searchQuery} = request.query;

    // Basic Pagination
    const limitVal = parseInt(limit);
    const skipVal = parseInt(skip) || 0;

    try {
        if(request.user_id === ADMIN_ID) {
            const orders = await Order.find({})
                .sort({ createdAt: -1 })
                .limit(limitVal)
                .skip(skipVal);
            response.status(200).json(orders);
        }
        else {
            const orders = await Order.find({ user: request.user_id })
                .sort({ createdAt: -1 })
                .limit(limitVal)
                .skip(skipVal);
            response.status(200).json(orders);
        }
    } catch (error) {
        response.status(500).json({ message: error.message});
    }
});


// helper method to adjust product quantities after an order is placed
const adjustProductQuantities = async (productId, quantityOrdered) => {
    try {
        let dbProduct = await Product.findById(productId);
        dbProduct.quantity -= quantityOrdered;
        await dbProduct.save();
    } catch (error) {
        throw error;
    }
}


app.listen(3000, () => {
    console.log('Server is running on port 3000');
});