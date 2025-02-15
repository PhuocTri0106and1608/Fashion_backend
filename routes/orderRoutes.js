const {Router} = require('express');
const orderController = require('../controllers/orderController');

const router= Router();

router.get('/get-all-order', orderController.getAllOrders);
router.get('/get-order-by-userId/:_id', orderController.getOrderByUserId);
router.post('/create-order', orderController.createOrder);
router.put('/cancel-order/:_id',orderController.cancelOrder);
router.put('/change-order-status/:_id',orderController.changeOrderStatus);
router.get('/get-order-by-status', orderController.getAllOrders);


module.exports= router;