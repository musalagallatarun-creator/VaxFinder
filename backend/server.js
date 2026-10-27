require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');


const app = express();

app.use(cors());
app.use(express.json());

// Connect to MySQL
async function getConnection() {
    return await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'vaccination_db'
    });
}

// Home route
app.get('/', (req, res) => {
    res.send('Vaccination Centre Availability API is running!');
});

// API 1: Get all vaccination centres or filter by exact PIN code
app.get('/api/centres', async (req, res) => {
    let connection;

    try {
        connection = await getConnection();

        const pincode = String(req.query.pincode || '').trim();

        let centres;

        if (pincode) {
            const [rows] = await connection.execute(
                `SELECT *
                 FROM vaccination_centres
                 WHERE pincode = ?`,
                [pincode]
            );

            centres = rows;
        } else {
            const [rows] = await connection.execute(
                'SELECT * FROM vaccination_centres'
            );

            centres = rows;
        }

        res.json(centres);
    } catch (error) {
        console.error('Vaccination centres error:', error.message);

        res.status(500).json({
            message: 'Unable to fetch vaccination centres. Check your MySQL configuration.'
        });
    } finally {
        if (connection) {
            await connection.end();
        }
    }
});

// API 2: Search postal offices by PIN code
app.get('/api/pincodes', async (req, res) => {
    let connection;

    try {
        const search = String(req.query.search || '').trim();

        connection = await getConnection();

        const [offices] = await connection.execute(
            `SELECT office_name, pincode, delivery_status, office_type
             FROM postal_offices
             WHERE CAST(pincode AS CHAR) LIKE ?
             ORDER BY pincode, office_name
             LIMIT 100`,
            [`%${search}%`]
        );

        res.json(offices);
    } catch (error) {
        console.error('PIN-code search error:', error.message);

        res.status(500).json({
            message: 'Unable to fetch PIN codes. Check your database and postal_offices table.'
        });
    } finally {
        if (connection) {
            await connection.end();
        }
    }
});

// Start the server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
