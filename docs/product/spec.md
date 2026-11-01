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
