const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const jwt = require('jsonwebtoken')
require('dotenv').config()

const app = express()
app.use(express.json()) // Middleware to parse JSON bodies

let database
const initializeDBandServer = async () => {
  try {
    database = await open({
      filename: path.join(__dirname, 'todoApplication.db'),
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server is running on http://localhost:3000/')
    })
  } catch (error) {
    console.error(`Database error: ${error.message}`)
    process.exit(1)
  }
}

initializeDBandServer()

const {JWT_SECRET} = process.env

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (token == null) return res.status(401).send('Token required')

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).send('Invalid Token')
    req.user = user
    next()
  })
}

const outputResult = dbobject => ({
  id: dbobject.id,
  todo: dbobject.todo,
  priority: dbobject.priority,
  category: dbobject.category,
  status: dbobject.status,
  dueDate: dbobject.due_date,
})

const handleInvalid = (res, statusCode, message) => {
  res.status(statusCode).send(message)
}

const isValidPriority = priority => ['HIGH', 'MEDIUM', 'LOW'].includes(priority)

const isValidStatus = status =>
  ['TO DO', 'IN PROGRESS', 'DONE'].includes(status)

const isValidCategory = category =>
  ['WORK', 'LEARNING', 'HOME'].includes(category)

// Login route to generate JWT token
app.post('/login', (req, res) => {
  const {username, password} = req.body

  // Validate user credentials (placeholder)
  if (username === 'admin' && password === 'password') {
    const token = jwt.sign({username}, JWT_SECRET, {expiresIn: '24h'})
    res.json({token})
  } else {
    res.status(401).send('Invalid credentials')
  }
})

// Get todos with query parameters
app.get('/todos/', authenticateToken, async (req, res) => {
  let data = null
  let getTodosQuery = ''
  const {search_q = '', priority, status, category} = req.query

  // Handling each scenario
  if (priority !== undefined && status !== undefined) {
    if (isValidPriority(priority) && isValidStatus(status)) {
      getTodosQuery = `SELECT * FROM todo WHERE status = '${status}' AND priority = '${priority}';`
    } else {
      return handleInvalid(res, 400, 'Invalid Todo Priority or Status')
    }
  } else if (priority !== undefined) {
    if (isValidPriority(priority)) {
      getTodosQuery = `SELECT * FROM todo WHERE priority = '${priority}';`
    } else {
      return handleInvalid(res, 400, 'Invalid Todo Priority')
    }
  } else if (status !== undefined) {
    if (isValidStatus(status)) {
      getTodosQuery = `SELECT * FROM todo WHERE status = '${status}';`
    } else {
      return handleInvalid(res, 400, 'Invalid Todo Status')
    }
  } else if (category !== undefined && status !== undefined) {
    if (isValidCategory(category) && isValidStatus(status)) {
      getTodosQuery = `SELECT * FROM todo WHERE category = '${category}' AND status = '${status}';`
    } else {
      return handleInvalid(res, 400, 'Invalid Todo Category or Status')
    }
  } else if (category !== undefined && priority !== undefined) {
    if (isValidCategory(category) && isValidPriority(priority)) {
      getTodosQuery = `SELECT * FROM todo WHERE category = '${category}' AND priority = '${priority}';`
    } else {
      return handleInvalid(res, 400, 'Invalid Todo Category or Priority')
    }
  } else if (search_q !== undefined) {
    getTodosQuery = `SELECT * FROM todo WHERE todo LIKE '%${search_q}%';`
  } else if (category !== undefined) {
    if (isValidCategory(category)) {
      getTodosQuery = `SELECT * FROM todo WHERE category = '${category}';`
    } else {
      return handleInvalid(res, 400, 'Invalid Todo Category')
    }
  } else {
    return handleInvalid(res, 400, 'Invalid request parameters')
  }

  // Execute the constructed query
  try {
    data = await database.all(getTodosQuery)
    res.send(data.map(eachItem => outputResult(eachItem)))
  } catch (error) {
    res.status(500).send(`Database error: ${error.message}`)
  }
})

// Get a specific todo by ID
app.get('/todos/:todoId/', authenticateToken, async (req, res) => {
  const {todoId} = req.params

  try {
    const getTodoQuery = `SELECT * FROM todo WHERE id = ${todoId};`
    const todo = await database.get(getTodoQuery)

    if (!todo) {
      res.status(404).send('Todo not found')
    } else {
      res.send(outputResult(todo))
    }
  } catch (error) {
    res.status(500).send(`Database error: ${error.message}`)
  }
})

// Get agenda items for a specific date
app.get('/agenda/', authenticateToken, async (req, res) => {
  const {date} = req.query

  if (isNaN(Date.parse(date))) {
    return res.status(400).send('Invalid Due Date')
  }

  try {
    const getAgendaQuery = `SELECT * FROM todo WHERE due_date = '${date}';`
    const agendaItems = await database.all(getAgendaQuery)

    res.send(agendaItems.map(item => outputResult(item)))
  } catch (error) {
    res.status(500).send(`Database error: ${error.message}`)
  }
})

// Add a new todo
app.post('/todos/', authenticateToken, async (req, res) => {
  const {todo, priority, category, status, dueDate} = req.body

  if (!isValidStatus(status)) {
    return res.status(400).send('Invalid Todo Status')
  }

  if (priority && !isValidPriority(priority)) {
    return res.status(400).send('Invalid Todo Priority')
  }

  if (category && !isValidCategory(category)) {
    return res.status(400).send('Invalid Todo Category')
  }

  try {
    const insertTodoQuery = `INSERT INTO todo (todo, priority, category, status, due_date) VALUES ('${todo}', '${priority}', '${category}', '${status}', '${dueDate}');`
    await database.run(insertTodoQuery)

    res.status(201).send('Todo Successfully Added')
  } catch (error) {
    res.status(500).send(`Database error: ${error.message}`)
  }
})

// Update an existing todo
app.put('/todos/:todoId/', authenticateToken, async (req, res) => {
  const {todoId} = req.params
  const updates = req.body

  // Validate updates
  if (updates.status && !isValidStatus(updates.status)) {
    return res.status(400).send('Invalid Todo Status')
  }

  if (updates.priority && !isValidPriority(updates.priority)) {
    return res.status(400).send('Invalid Todo Priority')
  }

  if (updates.category && !isValidCategory(updates.category)) {
    return res.status(400).send('Invalid Todo Category')
  }

  if (updates.dueDate && isNaN(Date.parse(updates.dueDate))) {
    return res.status(400).send('Invalid Due Date')
  }

  try {
    let updateQuery = 'UPDATE todo SET '

    Object.keys(updates).forEach((key, index) => {
      if (index !== 0) updateQuery += ', '
      updateQuery += `${key} = '${updates[key]}'`
    })

    updateQuery += ` WHERE id = ${todoId};`

    await database.run(updateQuery)

    res.send('Todo updated successfully')
  } catch (error) {
    res.status(500).send(`Database error: ${error.message}`)
  }
})

// Delete a todo
app.delete('/todos/:todoId/', authenticateToken, async (req, res) => {
  const {todoId} = req.params

  try {
    const deleteTodoQuery = `DELETE FROM todo WHERE id = ${todoId};`
    await database.run(deleteTodoQuery)

    res.send('Todo Deleted')
  } catch (error) {
    res.status(500).send(`Database error: ${error.message}`)
  }
})

module.exports = app
