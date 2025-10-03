require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
app.use(cors());

// Multer: store uploaded file temporarily
const upload = multer({ dest: "uploads/" });

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

// Route: upload image
app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    const filePath = req.file.path;

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(filePath, {
      folder: "property_uploads",
    });

    // Delete local temp file
    fs.unlinkSync(filePath);

    // Send back Cloudinary URL
    res.json({ url: result.secure_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload failed" });
  }
});


//Mongodb server

const dbPassword = encodeURIComponent(process.env.DB_PASS);

mongoose.connect(`mongodb+srv://${process.env.DB_USERNAME}:${dbPassword}@properties.5u9wvbb.mongodb.net/properties?retryWrites=true&w=majority&appName=Properties`)
  .then(() => console.log("✅ MongoDB properties connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: {
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    trim: true
  },
  phoneNumber: { type: String, required: true },
  profilePicUrl: { type: String, required: false },
  password: { type: String, required: true },
  likedProperties: { type: [String], default: [] }
});

const User = mongoose.model("User", userSchema);

app.post("/register", async (req, res) => {
  try {
    const { firstName, lastName, phoneNumber, email, profilePicUrl, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "This email is already registered" });
    const user = await User.create({ firstName, lastName, email, phoneNumber, profilePicUrl, password: hashed });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    return res.json({ token, user });
  } catch (err) {
    return res.status(500).json({ error: "Server error, please try again later" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    console.error(email);
    console.error(password);
    if (!user) return res.status(400).json({ emailError: "Incorrect email" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ passError: "Incorrect password" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    return res.json({ token, user });
  } catch (err) {
    return res.status(500).json({ error: "Server error, please try again later" });
  }
});


app.post("/userAcc", async (req, res) => {
  try {
    const userId = req.body.userId;

    const user = await User.findById(userId);
    if (!user) return res.status(400).json({ error: "Can't find user" });
    return res.json({ user });
  } catch (err) {
    return res.status(500).json({ error: "Server error, please try again later" });
  }
});

app.get("/validate", (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1]; // "Bearer <token>"

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    return res.status(200).json({ valid: true, userId: decoded.id });
  } catch (err) {
    return res.status(500).json({ error: "Check your connection" });
  }
});

app.put("/user/:id", async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    return res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Server error, please try again later" });
  }
});

const viewSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  propertyId: mongoose.Schema.Types.ObjectId,
  lastViewedAt: { type: Date, default: Date.now },
});

const View = mongoose.model("View", viewSchema);

app.post("/views", async (req, res) => {
  const {userId, propertyId} = req.body;

  const TIME_WINDOW_HOURS = 120;
  const cutoff = new Date(Date.now() - TIME_WINDOW_HOURS * 60 * 60 * 1000);
  console.error("update views");

  try {
    const lastView = await View.findOne({ userId, propertyId });
    if (!lastView || lastView.lastViewedAt < cutoff) {
      console.error("update");
      await Property.updateOne(
        { _id: propertyId },
        { $inc: { views: 1 } }
      );

      await View.updateOne(
        { userId, propertyId },
        { $set: { lastViewedAt: new Date() } },
        { upsert: true }
      );
    }

    const property = await Property.findById(propertyId);
    res.json({ views: property.views });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to register view" });
  }
});

const propertySchema = new mongoose.Schema({
  contactEmail: String,
  contactNumber: String,
  contactName: String,
  features: [String],
  imageUrls: [String],
  liked: Boolean,
  title: String,
  location: String,
  lat: String,
  lng: String,
  price: String,
  rating: String,
  bedrooms: String,
  bathrooms: String,
  area: String,
  type: String,
  views: Number,
  description: String,
});

const Property = mongoose.model("Property", propertySchema);

app.post("/properties", async (req, res) => {
  try {
    const property = new Property(req.body);
    await property.save();
    res.status(201).json(property);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/properties", async (req, res) => {
  try {
    console.error("get properties");
    const filters = {};

    if (req.query.liked) {
      filters.liked = req.query.liked === "true";
    }
    if (req.query.location) {
      filters.location = req.query.location;
    }
    if (req.query.title) {
      filters.title = new RegExp(req.query.title, "i");
    }

    const properties = await Property.find(filters);
    res.json(properties);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/properties/:id", async (req, res) => {
  try {
    const updated = await Property.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ error: "Property not found" });
    }
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/search", async (req, res) => {
  try {
    const query = req.query.q || "";

    const results = await Property.aggregate([
      {
        $search: {
          index: "default",
          autocomplete: {
      query: query,
      path: ["title", "description", "location"],
      fuzzy: {
        maxEdits: 1
      }
    }
        },
      },
      {
        $limit: 20,
      },
    ]);

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
