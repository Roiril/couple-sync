---
description: Research a topic (like a conference) and add it to the Themes database.
---

1. Learn about the specified topic using web search.
   - For example: "Wiss2026 conference themes and dates"
2. Summarize the key information:
   - Name of the event/topic
   - Brief description
   - Event date (if applicable, in YYYY-MM-DD format)
3. Add the theme to the database using the helper script.
   // turbo
   Run: `node scripts/add-theme.mjs "<Name>" "<Description>" "<EventDate>"`
4. Confirm to the user that the theme has been added and should appear in the app once it syncs.
