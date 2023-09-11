const mongoose = require('mongoose');

const productSchema = mongoose.Schema(
    {   
        name: { type: String, required: [true, "Enter a name"] },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
        uniqueKey: {
            type: String, 
            required: true, 
            unique: true,
            validate: {
                validator: function(value) {
                    return /^[A-Z][A-Za-z0-9-_]*$/.test(value);
                },
                message: `
                uniqueKey must start with a capital letter and 
                contain only letters, numbers, dashes and underscores.
                `
            }
        },
    },
    {
        timestamps: true,
    }
);

const Product = mongoose.model('Product', productSchema);
module.exports = Product;