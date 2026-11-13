
// server/index.js

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();

const PORT = process.env.PORT || 8000;

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      process.env.CLIENT_URL,
    ].filter(Boolean),
    credentials: true,
  })
);

app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let booksCollection;
let borrowsCollection;

const normalizeEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const isValidEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isValidId = (id) => ObjectId.isValid(id);

// Home route
app.get("/", (req, res) => {
  res.send("BookNook API is running!");
});

// Get all books or books belonging to a user
app.get("/books", async (req, res) => {
  try {
    const { userEmail } = req.query;
    const filter = {};

    if (userEmail) {
      const email = normalizeEmail(userEmail);

      if (!isValidEmail(email)) {
        return res.status(400).send({
          message: "Invalid email address",
        });
      }

      filter.userEmail = email;
    }

    const books = await booksCollection
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).send(books);
  } catch (error) {
    console.error("Get books error:", error);
    res.status(500).send({
      message: "Failed to get books",
    });
  }
});

// Get one book
app.get("/books/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).send({
        message: "Invalid book ID",
      });
    }

    const book = await booksCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!book) {
      return res.status(404).send({
        message: "Book not found",
      });
    }

    res.status(200).send(book);
  } catch (error) {
    console.error("Get single book error:", error);
    res.status(500).send({
      message: "Failed to get book",
    });
  }
});

// Add a new book
app.post("/books", async (req, res) => {
  try {
    const {
      title,
      author,
      category,
      description,
      image,
      quantity,
      userEmail,
    } = req.body;

    const email = normalizeEmail(userEmail);
    const bookQuantity = Number(quantity);

    if (!title?.trim() || !author?.trim()) {
      return res.status(400).send({
        message: "Book title and author are required",
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).send({
        message: "A valid user email is required",
      });
    }

    if (
      !Number.isInteger(bookQuantity) ||
      bookQuantity < 0
    ) {
      return res.status(400).send({
        message: "Quantity must be a valid non-negative number",
      });
    }

    const newBook = {
      title: title.trim(),
      author: author.trim(),
      category: category?.trim() || "General",
      description: description?.trim() || "",
      image: image?.trim() || "",
      quantity: bookQuantity,
      userEmail: email,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await booksCollection.insertOne(newBook);

    res.status(201).send({
      message: "Book added successfully",
      insertedId: result.insertedId,
      book: {
        ...newBook,
        _id: result.insertedId,
      },
    });
  } catch (error) {
    console.error("Add book error:", error);
    res.status(500).send({
      message: "Failed to add book",
    });
  }
});

// Update a book
app.patch("/books/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const email = normalizeEmail(req.body.userEmail);

    if (!isValidId(id)) {
      return res.status(400).send({
        message: "Invalid book ID",
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).send({
        message: "Valid user email is required",
      });
    }

    const allowedFields = [
      "title",
      "author",
      "category",
      "description",
      "image",
      "quantity",
    ];

    const updateFields = {};

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateFields[field] =
          field === "quantity"
            ? Number(req.body[field])
            : typeof req.body[field] === "string"
              ? req.body[field].trim()
              : req.body[field];
      }
    });

    if (
      updateFields.quantity !== undefined &&
      (
        !Number.isInteger(updateFields.quantity) ||
        updateFields.quantity < 0
      )
    ) {
      return res.status(400).send({
        message: "Invalid quantity",
      });
    }

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).send({
        message: "No update data provided",
      });
    }

    updateFields.updatedAt = new Date();

    const result = await booksCollection.updateOne(
      {
        _id: new ObjectId(id),
        userEmail: email,
      },
      {
        $set: updateFields,
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({
        message: "Book not found or you do not own this book",
      });
    }

    res.send({
      message: "Book updated successfully",
    });
  } catch (error) {
    console.error("Update book error:", error);
    res.status(500).send({
      message: "Failed to update book",
    });
  }
});

// Delete a book
app.delete("/books/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const email = normalizeEmail(req.query.userEmail);

    if (!isValidId(id)) {
      return res.status(400).send({
        message: "Invalid book ID",
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).send({
        message: "Valid user email is required",
      });
    }

    const book = await booksCollection.findOne({
      _id: new ObjectId(id),
      userEmail: email,
    });

    if (!book) {
      return res.status(404).send({
        message: "Book not found or you do not own this book",
      });
    }

    const activeBorrow = await borrowsCollection.findOne({
      bookId: id,
      status: "borrowed",
    });

    if (activeBorrow) {
      return res.status(400).send({
        message: "This book cannot be deleted while it is borrowed",
      });
    }

    await booksCollection.deleteOne({
      _id: new ObjectId(id),
      userEmail: email,
    });

    res.send({
      message: "Book deleted successfully",
    });
  } catch (error) {
    console.error("Delete book error:", error);
    res.status(500).send({
      message: "Failed to delete book",
    });
  }
});

// Borrow a book
app.post("/borrows", async (req, res) => {
  try {
    const { bookId, userEmail, dueDate } = req.body;
    const email = normalizeEmail(userEmail);

    if (!isValidId(bookId)) {
      return res.status(400).send({
        message: "Invalid book ID",
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).send({
        message: "Valid user email is required",
      });
    }

    const existingBorrow = await borrowsCollection.findOne({
      bookId,
      userEmail: email,
      status: "borrowed",
    });

    if (existingBorrow) {
      return res.status(409).send({
        message: "You have already borrowed this book",
      });
    }

    const book = await booksCollection.findOneAndUpdate(
      {
        _id: new ObjectId(bookId),
        quantity: { $gt: 0 },
      },
      {
        $inc: { quantity: -1 },
      },
      {
        returnDocument: "after",
      }
    );

    if (!book) {
      return res.status(400).send({
        message: "Book is not available",
      });
    }

    const borrowRecord = {
      bookId,
      title: book.title,
      author: book.author,
      image: book.image || "",
      userEmail: email,
      borrowedAt: new Date(),
      dueDate: dueDate ? new Date(dueDate) : null,
      status: "borrowed",
    };

    try {
      const result = await borrowsCollection.insertOne(
        borrowRecord
      );

      res.status(201).send({
        message: "Book borrowed successfully",
        insertedId: result.insertedId,
      });
    } catch (insertError) {
      await booksCollection.updateOne(
        {
          _id: new ObjectId(bookId),
        },
        {
          $inc: { quantity: 1 },
        }
      );

      throw insertError;
    }
  } catch (error) {
    console.error("Borrow book error:", error);
    res.status(500).send({
      message: "Failed to borrow book",
    });
  }
});

// Get borrow records
app.get("/borrows", async (req, res) => {
  try {
    const { userEmail, status } = req.query;
    const filter = {};

    if (userEmail) {
      const email = normalizeEmail(userEmail);

      if (!isValidEmail(email)) {
        return res.status(400).send({
          message: "Invalid email address",
        });
      }

      filter.userEmail = email;
    }

    if (status) {
      filter.status = status;
    }

    const borrows = await borrowsCollection
      .find(filter)
      .sort({ borrowedAt: -1 })
      .toArray();

    res.send(borrows);
  } catch (error) {
    console.error("Get borrows error:", error);
    res.status(500).send({
      message: "Failed to get borrow records",
    });
  }
});

// Return a borrowed book
app.patch("/borrows/:id/return", async (req, res) => {
  try {
    const { id } = req.params;
    const email = normalizeEmail(req.body.userEmail);

    if (!isValidId(id)) {
      return res.status(400).send({
        message: "Invalid borrow ID",
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).send({
        message: "Valid user email is required",
      });
    }

    const borrow = await borrowsCollection.findOne({
      _id: new ObjectId(id),
      userEmail: email,
      status: "borrowed",
    });

    if (!borrow) {
      return res.status(404).send({
        message: "Active borrow record not found",
      });
    }

    const result = await borrowsCollection.updateOne(
      {
        _id: new ObjectId(id),
        userEmail: email,
        status: "borrowed",
      },
      {
        $set: {
          status: "returned",
          returnedAt: new Date(),
        },
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(409).send({
        message: "This book has already been returned",
      });
    }

    if (isValidId(borrow.bookId)) {
      await booksCollection.updateOne(
        {
          _id: new ObjectId(borrow.bookId),
        },
        {
          $inc: { quantity: 1 },
        }
      );
    }

    res.send({
      message: "Book returned successfully",
    });
  } catch (error) {
    console.error("Return book error:", error);
    res.status(500).send({
      message: "Failed to return book",
    });
  }
});

// Connect MongoDB and start server
async function run() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from .env file");
    }

    await client.connect();

    const database = client.db("bookNook");

    booksCollection = database.collection("books");
    borrowsCollection = database.collection("borrows");

    // Check existing borrow index before creating a new one
    const indexes = await borrowsCollection
      .listIndexes()
      .toArray();

    const existingBorrowIndex = indexes.find(
      (index) =>
        index.name === "unique_active_borrow_per_user" ||
        (
          index.key?.bookId === 1 &&
          index.key?.userEmail === 1
        )
    );

    if (!existingBorrowIndex) {
      await borrowsCollection.createIndex(
        {
          bookId: 1,
          userEmail: 1,
        },
        {
          name: "unique_active_borrow_per_user",
          unique: true,
          partialFilterExpression: {
            status: "borrowed",
          },
        }
      );
    }

    console.log("MongoDB connected successfully");
    console.log("Borrow index checked successfully!");

    app.listen(PORT, () => {
      console.log(
        `BookNook server running on port ${PORT}`
      );
    });
  } catch (error) {
    console.error("Server startup error:", error);
    process.exit(1);
  }
}

run();
