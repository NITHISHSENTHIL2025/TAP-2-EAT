Digital Canteen Ordering System

A full-stack web application that digitizes campus canteen operations by allowing students to place food orders online and enabling canteen staff to manage orders efficiently.

📌 Problem Statement

College canteens often face long queues during breaks, leading to wasted time and overcrowding. Manual order taking results in mistakes and delays.

This system provides:

Online menu browsing

Advance food ordering

Order status tracking

Admin menu & order management

Built as a 5-hour MVP hackathon project focusing on core workflow and usability.

🎯 Objectives

Reduce waiting time in canteens

Improve order accuracy

Provide structured order management

Store order history digitally

👥 Target Users
👨‍🎓 Students

Register / Login

View Menu

Add items to cart

Place orders

Track order status

View order history

👨‍🍳 Canteen Admin / Staff

Secure login

Add / Update / Delete menu items

View incoming orders

Update order status (Pending / Preparing / Ready / Completed)

🚀 Features Implemented
Student Module

Authentication (Login / Register)

Menu listing with price & description

Cart system

Order placement

Real-time order status tracking

Order history

Admin Module

Role-based access control

Menu management (CRUD operations)

View all orders

Update order status

System Features

Duplicate order prevention logic

Persistent data storage

Responsive UI (Mobile + Desktop)

Basic validation on forms

🛠️ Tech Stack

Frontend:

React.js

HTML5

CSS3

Backend:

Node.js

Express.js

Database:

PostgreSQL / MongoDB (depending on implementation)

Authentication:

JWT-based authentication

📂 Project Structure
/client      → React Frontend
/server      → Node + Express Backend
/database    → Database schema / config
⚙️ Installation & Setup
1️⃣ Clone Repository
git clone https://github.com/your-username/digital-canteen.git
cd digital-canteen
2️⃣ Backend Setup
cd server
npm install
npm start

Make sure to configure .env file:

PORT=5000
DATABASE_URL=your_database_url
JWT_SECRET=your_secret_key
3️⃣ Frontend Setup
cd client
npm install
npm start

Frontend will run on:

http://localhost:3000

Backend will run on:

http://localhost:5000
🗄️ Database Schema (Basic)
Users

id

name

email

password

role (student/admin)

Menu

id

item_name

price

description

Orders

id

user_id

total_amount

status

created_at

Order_Items

id

order_id

menu_id

quantity

🔐 Security

Password hashing

JWT authentication

Role-based authorization

Basic input validation

📊 MVP Scope

This project focuses on:

Core ordering workflow

Basic admin controls

Clean UI

Persistent storage

Real payment gateway integration is not included (simulation only).

🎥 Demo Flow

Student logs in

Browses menu

Adds items to cart

Places order

Admin sees new order

Admin updates status

Student tracks order

🔮 Future Enhancements

Estimated preparation time

Order notifications

Payment gateway integration

QR-based pickup system

Analytics dashboard for sales

Live queue monitoring
