require('dotenv').config()
const express=require('express')
const app=express();
const authRoutes=require('./routes/auth')
const connection=require('./connection.js/connection')
const fileRoutes=require('./routes/file')
const adminRoutes=require('./routes/admin')
const cors=require('cors')

app.use(cors())
connection
app.use(express.json())
app.use(fileRoutes)
app.use(authRoutes)
app.use(adminRoutes)

app.listen(5000,()=>{
    console.log(`Listening to port new ${process.env.PORT}`)
})