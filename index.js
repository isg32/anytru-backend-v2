require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const swaggerUi = require('swagger-ui-express');
const connectDB = require('./src/config/db');
const corsOptions = require('./src/config/corsOptions');
const passportConfig = require('./src/config/passport');
const keys = require('./src/config/keys');
const Chat = require('./src/models/Chat');
const NotificationService = require('./src/services/notificationService');
const Message = require('./src/models/Message');
const helmet = require('helmet');
const morgan = require('morgan');
const xss = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');
const swaggerDocument = require('./src/utils/swagger-output.json');

const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
	pingTimeout: 60000,
	cors: {
		origin: '*',
	  }
});



const PORT = keys.port;

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '/public')));

app.use(morgan('tiny'));

// set security HTTP headers
app.use(helmet());


// sanitize request data
app.use(xss());
app.use(mongoSanitize());


// Initialize Passport
passportConfig.initializePassport(app);

// Routes
app.use('/', require('./src/routes/root'));
app.use('/auth', require('./src/routes/auth'));
app.use('/user', require('./src/routes/user'));
app.use('/product', require('./src/routes/product'));
app.use('/wishlist', require('./src/routes/wishlist'));
app.use('/address', require('./src/routes/address'));
app.use('/aboutUs', require('./src/routes/aboutUs'));
app.use('/t&c', require('./src/routes/t&c'));
app.use('/contact', require('./src/routes/contact'));
app.use('/merchantReq', require('./src/routes/merchant'));
app.use('/vendor', require('./src/routes/vendor'));
app.use('/ads', require('./src/routes/ads'));
app.use('/order', require('./src/routes/order'));
app.use('/notifications', require('./src/routes/notifications'));
app.use('/chat', require('./src/routes/chat'));
app.use('/message', require('./src/routes/message'));
app.use('/creater', require('./src/routes/message'));
app.use('/reports', require('./src/routes/reports'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Socket.IO Middleware
// io.use((socket, next) => {
// 	const token = socket.handshake.query.token?.split(' ')[1];
// 	if (token) {
// 		jwt.verify(token, keys.jwt.secret, (err, decoded) => {
// 			if (err) return next(new Error('Authentication error'));
// 			socket.user = decoded;
// 			next();
// 		});
// 	} else {
// 		next(new Error('Authentication error'));
// 	}
// });

// Socket.IO Handlers

// const Room = {
// 	usersMoves: Map<string, Move[]>;
// 	drawed: Move[];
// 	users: Map<string, string>;
//   };
  

const rooms = new Map();


io.on('connection', (socket) => {
	console.log('A user connected');

	socket.on('disconnect', () => {
		console.log('User disconnected');
	});

	
		// chat and whiteboard start
        const getRoomId=(userOneId,userTwoId)=>{
			const roomId = [userOneId, userTwoId].sort().join('_');
			return roomId;	
		}
		socket.on('join_or_create_room', ({ userOneId, userTwoId }) => {
		
			const roomId = [userOneId, userTwoId].sort().join('_');	
			console.log(roomId);
			let room = rooms.get(roomId);		
			if (!room) {
				room = {
					userMoves: new Map([[socket.id, []]]),
					drawed: [],
					users: new Map([[socket.id, userOneId]])
				};
				rooms.set(roomId, room);
				io.to(socket.id).emit('created', roomId);
			} else{
				socket.join(roomId);
				room.users.set(socket.id, userOneId);
				room.userMoves.set(socket.id, []);		
				io.to(socket.id).emit('joined', roomId);
				
			}
			console.log(rooms);
		});


		socket.on('send_msg',({userOneId,userTwoId,msg})=>{
			console.log(msg);
			console.log(socket.id);
			console.log(getRoomId(userOneId,userTwoId));
			io.to(getRoomId(userOneId,userTwoId)).emit('new_msg',socket.id,msg)
		})
		
		

		// ends

	socket.on('joinRoom', ({ userId, room }) => {
		socket.join(room);
		console.log(`${userId} joined room ${room}`);
	});

	socket.on('chatMessage', async ({ chat, content }) => {
		try {
			const message = {
				sender: socket.user.id,
				content,
				timestamp: new Date()
			};

			const chatDoc = await Chat.findById(chat);
			if (chatDoc) {
				chatDoc.messages.push(message);
				await chatDoc.save();
				io.to(chat).emit('message', message);
				await sendNotification(chatDoc.participants, socket.user.id, content);
			}
		} catch (error) {
			console.error('Error sending message:', error);
		}
	});

	socket.on('getMessages', async ({ userId, contactId }) => {
		try {
			const messages = await Message.find({
				$or: [
					{ sender: userId, receiver: contactId },
					{ sender: contactId, receiver: userId }
				]
			}).sort({ timestamp: 1 });

			socket.emit('messages', messages);
		} catch (error) {
			console.error('Error fetching messages:', error);
		}
	});

	socket.on('getNotifications', async ({ userId }) => {
		try {
			const notifications = await NotificationService.getNotifications(userId);
			socket.emit('notifications', notifications);
		} catch (error) {
			console.error('Error fetching notifications:', error);
		}
	});

	socket.on('markNotificationAsRead', async ({ notificationId }) => {
		try {
			await NotificationService.markAsRead(notificationId);
		} catch (error) {
			console.error('Error marking notification as read:', error);
		}
	});
});

async function sendNotification(participants, senderId, content) {
	for (const participantId of participants) {
		if (participantId !== senderId) {
			const notification = await NotificationService.createNotification(
				participantId,
				`New message from ${senderId}`,
				`/chat/${senderId}`
			);
			io.to(participantId).emit('notification', notification);
		}
	}
}

// Start server after MongoDB connection is established
mongoose.connection.once('open', () => {
	console.log('Connected to MongoDB');
	server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});

