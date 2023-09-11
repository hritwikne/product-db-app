const mongoose = require('mongoose');

const orderSchema = mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        productName: {
            type: String,
            required: true
        },
        productQuantity: {
            type: Number,
            required: true
        },
        totalPrice: {
            type: Number,
            required: true
        }
    },
    {
        timestamps: true,
    }
)

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;