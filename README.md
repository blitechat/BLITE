 # BLITE

  Privacy-first encrypted messaging. Text, voice, and video — all end-to-end encrypted.

  ## Screenshots

![%rfUpbeat](https://github.com/user-attachments/assets/dc9f5fd8-aa59-48c9-9125-e1f8ab019e5c)
![%rfWarm](https://github.com/user-attachments/assets/b9225b21-212e-42f5-a6ba-ac9f7f534be9)
![%rfWorthy](https://github.com/user-attachments/assets/4696510b-15ed-4d00-b19a-6fd5576442c0)


  ## Features

  - E2EE Messaging — Double Ratchet for DMs, Sender Keys for channels (same protocols as Signal)
  - E2EE Voice & Video — AES-GCM encrypted, SFU-based via mediasoup
  - Communities — Servers with channels, roles, permissions, and invites
  - Friends & DMs — 1-on-1 messaging, voice calls, and video calls
  - File Sharing — Send files and images in chats
  - Desktop App — Windows and Linux (Electron), web app also available
  - Self-hostable — One script setup, Docker-based, SQLite, no external dependencies

  ## Try It

  Hosted: https://blite.chat
  Desktop downloads: GitHub Releases page

  ## Self-Hosting

  3 commands:

  git clone https://github.com/blitechat/BLITE && cd BLITE
  bash setup.sh
  # choose "lite" (text only) or "full" (voice + video)

  Full docs in SELF_HOST.md

  Requirements: Linux, Docker, Docker Compose, 512MB RAM minimum.

  ## Security & Privacy

  - Server cannot read message content — everything is encrypted client-side
  - Server cannot decrypt voice or video streams
  - Metadata (timing, membership) is visible to the server operator — self-hosting eliminates that trust requirement

  Full details in PRIVACY.md

  ## License

  MIT
