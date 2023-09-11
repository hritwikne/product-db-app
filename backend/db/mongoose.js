const mongoose = require('mongoose');

mongoose
.connect('mongodb+srv://admin:admin@demo-crud.3vthext.mongodb.net/ProductDB-API?retryWrites=true&w=majority', {useNewUrlParser: true}).then(() => {
    console.log('Connected to MongoDB successfully!');
})
.catch((e) => {
    console.log('Error while attempting to connect to MongoDB');
    console.log(e);
});

module.exports = {
    mongoose
};