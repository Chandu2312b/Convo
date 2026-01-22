# Deploying Backend to Render

Since your application uses **Socket.IO** and **in-memory storage**, it requires a hosting provider that keeps the server running continuously (unlike Vercel, which shuts it down). **Render** is a great free option for this.

## Step 1: Push Code to GitHub
Make sure your latest code (including the `backend` folder) is pushed to your GitHub repository.

## Step 2: Create a Web Service on Render
1.  Go to [dashboard.render.com](https://dashboard.render.com/).
2.  Click **"New +"** and select **"Web Service"**.
3.  Connect your GitHub repository.
4.  Give it a name (e.g., `chat-app-backend`).
5.  **Important Configuration:**
    *   **Root Directory:** `backend` (This is crucial because your server is inside the backend folder)
    *   **Runtime:** `Node`
    *   **Build Command:** `npm install`
    *   **Start Command:** `node server.js`
    *   **Instance Type:** Free (or Starter)

## Step 3: Environment Variables
Scroll down to "Environment Variables" and add:
*   `GEMINI_API_KEY`: [Paste your actual Gemini API Key here]
*   `PORT`: `5000` (Render usually handles this, but good to set)

## Step 4: Deploy
Click **"Create Web Service"**. Render will start building.
Once it finishes, you will get a URL like `https://chat-app-backend.onrender.com`.

## Step 5: Update Frontend
1.  Go to your `frontend/src/App.js` file.
2.  Update the `SERVER_URL` to your new Render URL:
    ```javascript
    const SERVER_URL = 'https://your-new-backend-url.onrender.com';
    ```
3.  Commit and push these changes to GitHub.
4.  Vercel will automatically redeploy your **Frontend** with the new configuration.

## Step 6: Verify
Open your Vercel frontend link. It should now successfully connect to the Render backend, and messages will work!
