# Product spec

## Problem
A person who reads a lot wants to remember which books they want to read, which they are reading, and what they thought of the ones they finished. Today they keep a notes-app list that has no status, no ratings and gets long and messy.

## Users
One person per account, on desktop or phone. They add a book in a few seconds, move it along as they read, and look back at what they finished.

## Scope for this version

### M1: my shelf
- Sign up and sign in with email and password (local Supabase auth, no email confirmation). Sign out from the header.
- `/books` shows my books, newest added first: title, author, and a status badge (Want to read, Reading, Finished).
- Empty state when I have no books: one sentence and an "Add book" button.
- Add a book: title (required, 1 to 200 characters), author (required, 1 to 120 characters), status (defaults to Want to read). Validation errors show next to the field.
- I only ever see my own books. Signed-out visitors who open `/books` are sent to sign in.

### M2: track and look back
- Change a book's status from its page `/books/<id>`; finishing a book records the finish date (today).
- Rate a finished book 1 to 5 stars and write a short review (up to 2,000 characters) on its page.
- Filter the list by status with tabs (All, Want to read, Reading, Finished); the tab is kept in the URL (`?status=`).
- Delete a book after a confirm dialog; it disappears from the list.
- `/stats` shows how many books I finished this year and my average rating.
- Opening another user's book id, or one that does not exist, shows a "Book not found" page (404).

### M3: keep the shelf tidy
- Edit a book's title and author from its page `/books/<id>`, with the same limits and field errors as adding a book. The list shows the new values.
- Search my shelf on `/books` by title or author (case-insensitive, any part of the word). The search is kept in the URL (`?q=`) and combines with the status tab. No matches shows one sentence and a way to clear the search.
- Sort the list on `/books`: Newest added (default), Title A to Z, or Highest rated (unrated books last). The sort is kept in the URL (`?sort=`) and combines with the tab and the search.
- Set a reading goal for this year on `/stats`: a number of books from 1 to 365. Stats shows "N of G books finished this year" with a progress bar. I can change the goal; without one, Stats invites me to set it.

### M4: shelves and progress
- Make my own named shelves (for example "Travel" or "Book club"): a name from 1 to 40 characters, unique among my shelves. Rename or delete a shelf on `/shelves`; deleting a shelf keeps its books.
- Put a book on any number of my shelves from its page `/books/<id>`, and take it off again. The book's page lists its shelves.
- Filter `/books` by one shelf; the shelf is kept in the URL (`?shelf=`) and combines with the status tab, the search and the sort.
- Record reading progress on a book I am reading: total pages (1 to 10,000) and the page I am on (0 to total). The list shows its percentage with a small progress bar; finishing the book sets the page to the total.

## Out of scope
- Book search APIs, covers, ISBN lookup, sharing, social features, import/export.
- Password reset, social login, email confirmation.

## Look and feel
Warm and bookish, like a small independent bookshop's site or Literal. Light theme only. Cream background, dark brown-black text, one accent color: deep green (around #166534) for primary buttons and links. A serif font for book titles and headings, system sans for everything else. Rounded corners about 6px, comfortable spacing. Works on a phone screen (single column).

## Stack
Next.js + Supabase (the nextjs-supabase preset).

## Definition of done
- M1: I can sign up, add two books, see them newest first with their status, sign out, and get sent to sign in when I open `/books`.
- M2: I can move a book to Finished and rate it, filter by status, delete a book, see my stats, and a second account cannot open my book's URL.
- M3: I can fix a typo in a book's title, find a book by part of its author's name, sort my finished books by rating, and see my progress toward a goal of 20 books this year.
- M4: I can make a "Travel" shelf, put two books on it, filter my list to that shelf together with the Reading tab, and see that I am 40% through a 250-page book.
