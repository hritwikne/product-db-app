const mongoose = require('mongoose');
const _ = require('lodash');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs'); 
const crypto = require('crypto');
const exp = require('constants');

// used to sign the token
const jwtSecret = "duqwhdyyt62te7812ebwhqdbasbu29";

const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        minlength: 1,
        trim: true
    },
    email: {
        type: String,
        required: true,
        minlength: 1,
        trim: true,
        unique: true
    },
    password: {
        type: String,
        required: true,
        minlength: 8,
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    sessions: [{
        token: {
            type: String,
            required: true
        },
        expiresAt: {
            type: Number,
            required: true
        }
    }]
});


// INSTANCE METHODS


UserSchema.methods.toJSON = function () {
    const user = this;
    const userObject = user.toObject();
    return _.omit(userObject, ['password', 'sessions']);
}


UserSchema.methods.generateAccessAuthToken = function () {
    const user = this;
    return new Promise((resolve, reject) => {
        // Create the JSON web token 
        jwt.sign({ _id: user._id.toHexString() }, jwtSecret, { expiresIn: "15m" }, (err, token) => {
            if (!err) {
                resolve(token);
            } else {
                reject();
            }
        })
    })
}


UserSchema.methods.generateRefreshAuthToken = function () {
    // This method simply generates a 64byte hex string
    // it doesn't save it to the database, saveSessionToDatabase() does that.
    return new Promise((resolve, reject) => {
        crypto.randomBytes(64, (err, buf) => {
            if (!err) {
                let token = buf.toString('hex');

                return resolve(token);
            }
        })
    })
}


UserSchema.methods.createSession = function () {
    let user = this;

    return user.generateRefreshAuthToken().then((refreshToken) => {
        return saveSessionToDatabase(user, refreshToken);
    }).then((refreshToken) => {
        return refreshToken;
    }).catch((e) => {
        return Promise.reject('Failed to save session to database.\n' + e);
    })
}


// STATIC METHODS


UserSchema.statics.getJWTSecret = () => {
    return jwtSecret;
}


UserSchema.statics.findByIdAndToken = function (_id, token) {
    const User = this;
    return User.findOne({
        _id,
        'sessions.token': token
    });
}


UserSchema.statics.findByCredentials = function (email, password) {
    let user = this;
    return user.findOne({ email }).then((user) => {
        if (!user) return Promise.reject();

        return new Promise((resolve, reject) => {
            bcrypt.compare(password, user.password, (err, res) => {
                if (res) 
                    return resolve(user);
                else 
                    return reject();
            })
        })
    })
}


UserSchema.statics.hasRefreshTokenExpired = (expiresAt) => {
    let secondsSinceEpoch = Date.now() / 1000;
    let hasExpired = expiresAt < secondsSinceEpoch;
    if (hasExpired) {
        return true;
    } else {
        return false;
    }
}


// MIDDLEWARE

// Before a user document is saved, this code runs
UserSchema.pre('save', function (next) {
    let user = this;
    let costFactor = 10;

    // if the password field has been edited/changed then run this code.
    if (user.isModified('password')) {

        // Generate salt and hash password
        bcrypt.genSalt(costFactor, (err, salt) => {
            bcrypt.hash(user.password, salt, (err, hash) => {
                user.password = hash;
                next();
            })
        })
    } else {
        next();
    }
})


// HELPER METHODS

let saveSessionToDatabase = (user, refreshToken) => {
    return new Promise((resolve, reject) => {
        let expiresAt = generateRefreshTokenExpiryTime();

        user.sessions.push({ 'token': refreshToken, expiresAt });

        user.save().then(() => {
            return resolve(refreshToken);
        }).catch((e) => {
            reject(e);
        })
    })
}


let generateRefreshTokenExpiryTime = () => {
    let daysUntilExpire = "10";
    let secondsUntilExpire = ((daysUntilExpire * 24) * 60) * 60;
    return ((Date.now() / 1000) + secondsUntilExpire);
}


// MODEL CREATION

const User = mongoose.model('User', UserSchema);
module.exports = User;