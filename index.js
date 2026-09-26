require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const express = require('express');
const multer = require('multer');
const cors = require('cors');

// ==========================================
// 1. DATABASE SETUP
// ==========================================
const FileSchema = new mongoose.Schema({
    filename: { type: String, required: true },
    fileId: { type: String, required: true, unique: true },
    content: { type: String, required: true },
    uploader: { type: String, required: true },
    source: { type: String, default: 'Unknown' },
    size: { type: String },
    type: { type: String, default: '.txt' },
    timestamp: { type: Date, default: Date.now }
});

const FileModel = mongoose.model('File', FileSchema);

// ==========================================
// 2. WEBSITE SETUP
// ==========================================
const app = express();
app.use(cors());
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- KEEPALIVE ENDPOINT (for UptimeRobot) ---
app.get('/keepalive', (req, res) => {
    res.status(200).send('Bot is alive!');
});

// --- HOMEPAGE: Upload Form ---
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>LuaLeak File Uploader</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { font-family: Arial, sans-serif; background: #1e1f22; color: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
            .container { background: #2b2d31; padding: 40px; border-radius: 12px; width: 100%; max-width: 420px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
            h1 { color: #5865F2; text-align: center; margin-top: 0; }
            label { display: block; margin-top: 15px; font-size: 14px; color: #b5bac1; }
            input { width: 100%; padding: 10px; margin-top: 5px; border-radius: 6px; border: 1px solid #1e1f22; background: #1e1f22; color: #fff; box-sizing: border-box; }
            button { width: 100%; padding: 12px; margin-top: 20px; background: #5865F2; color: white; border: none; border-radius: 6px; font-size: 16px; cursor: pointer; font-weight: bold; }
            button:hover { background: #4752c4; }
            button:disabled { background: #555; cursor: not-allowed; }
            #status { margin-top: 15px; text-align: center; font-size: 14px; }
            .success { color: #57F287; }
            .error { color: #ED4245; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>📂 Upload File</h1>
            <form id="uploadForm">
                <label>File (.txt)</label>
                <input type="file" name="file" accept=".txt" required>

                <label>File ID (e.g., aamu)</label>
                <input type="text" name="fileId" placeholder="aamu" required>

                <label>Source (e.g., #Sab)</label>
                <input type="text" name="source" placeholder="#Sab" required>

                <label>Uploader</label>
                <input type="text" name="uploader" placeholder="sm7mog" required>

                <button type="submit" id="submitBtn">Upload File</button>
            </form>
            <div id="status"></div>
        </div>

        <script>
            const form = document.getElementById('uploadForm');
            const status = document.getElementById('status');
            const submitBtn = document.getElementById('submitBtn');

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                status.textContent = 'Uploading...';
                status.className = '';
                submitBtn.disabled = true;

                const formData = new FormData(form);
                try {
                    const res = await fetch('/upload', { method: 'POST', body: formData });
                    const data = await res.json();
                    if (res.ok) {
                        status.textContent = '✅ ' + data.message + ' (ID: ' + data.fileId + ')';
                        status.className = 'success';
                        form.reset();
                    } else {
                        status.textContent = '❌ ' + (data.message || 'Upload failed');
                        status.className = 'error';
                    }
                } catch (err) {
                    status.textContent = '❌ Error: ' + err.message;
                    status.className = 'error';
                } finally {
                    submitBtn.disabled = false;
                }
            });
        </script>
    </body>
    </html>
    `);
});

// --- UPLOAD HANDLER ---
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const { fileId, source, uploader } = req.body;
        if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });

        const existing = await FileModel.findOne({ fileId });
        if (existing) {
            return res.status(400).json({ message: 'That File ID already exists. Use a different one.' });
        }

        const content = req.file.buffer.toString('utf-8');
        const size = (req.file.size / 1024).toFixed(2) + ' KB';

        const newFile = new FileModel({
            filename: req.file.originalname,
            fileId: fileId,
            content: content,
            uploader: uploader || 'WebUser',
            source: source || 'Web Upload',
            size: size,
            type: '.txt'
        });

        await newFile.save();
        res.status(200).json({ message: 'File uploaded successfully', fileId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error: ' + err.message });
    }
});

// --- VIEW FILE BY ID ---
app.get('/file/:id', async (req, res) => {
    try {
        const file = await FileModel.findOne({ fileId: req.params.id });
        if (!file) return res.status(404).send('File not found');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(file.content);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));

// ==========================================
// 3. DISCORD BOT
// ==========================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
    ]
});

client.on('ready', () => {
    console.log(`Discord Bot logged in as ${client.user.tag}!`);
    
    // ✅ SET BOT TO INVISIBLE (appears offline but still works)
    client.user.setPresence({
        status: 'invisible',
        activities: []
    });
    
    console.log('Bot status set to INVISIBLE (appears offline but still works)');
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    if (message.content.startsWith('.find')) {
        const args = message.content.slice(5).trim();
        if (!args) return message.reply('Please provide a search term. Example: `.find auto steal`');

        // CHECK PROFILE STATUS
        try {
            const member = await message.guild.members.fetch(message.author.id);
            const status = member.presence?.activities.find(a => a.type === 4);
            const requiredText = '.gg/luascript';

            if (!status || !status.state || !status.state.includes(requiredText)) {
                return message.reply(`Please put ${requiredText} in your Discord profile status to use the .find command.`);
            }
        } catch (error) {
            console.log("Could not fetch member presence. Check Bot Intents.");
        }

        // SEARCH DATABASE
        const files = await FileModel.find({
            $or: [
                { filename: { $regex: args, $options: 'i' } },
                { fileId: { $regex: args, $options: 'i' } }
            ]
        }).limit(1);

        if (files.length === 0) {
            return message.reply('No files found matching that query.');
        }

        const file = files[0];
        const renderUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

        const embed = new EmbedBuilder()
            .setAuthor({ name: 'LuaLeak File Finder', iconURL: client.user.displayAvatarURL() })
            .setTitle(file.filename)
            .setDescription(`**Open file** • Search: \`${args}\``)
            .addFields(
                { name: '🆔 File ID', value: `\`${file.fileId}\``, inline: true },
                { name: '📂 Source', value: `${file.source}`, inline: true },
                { name: '👤 Uploader', value: `${file.uploader}`, inline: true },
                { name: '📦 Size', value: `${file.size}`, inline: true },
                { name: '🧩 Type', value: `${file.type}`, inline: true }
            )
            .setFooter({ text: `Result 1 of 1 • Use the buttons to browse • ${new Date(file.timestamp).toLocaleDateString()}` })
            .setColor('#5865F2');

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('Open file')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`${renderUrl}/file/${file.fileId}`),
                new ButtonBuilder()
                    .setCustomId('browse')
                    .setLabel('Look Through Files')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('prev')
                    .setLabel('◀')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            );

        message.reply({ embeds: [embed], components: [row] });
    }
});

// CONNECT TO DATABASE AND LOGIN BOT
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('Connected to MongoDB');
        client.login(process.env.TOKEN);
    })
    .catch(err => console.log('DB Connection Error:', err));
