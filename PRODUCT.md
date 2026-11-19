# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite + TypeScript, no UI framework. Deployed to GitHub Pages from the public `earshot` repository via GitHub Actions.

## Users

The owner, showing it off as a demo and portfolio piece: two devices in one room (laptop + phone, or two laptops), one sends a picture out loud through its speaker and the other draws it, line by line, from its microphone while people watch. Secondary: anyone who opens the public link and tries it alone with loopback.

## Product Purpose

Earshot sends images through sound, live. One app holds both ends: a transmitter that turns a picture into an audible SSTV-style tone sequence and plays it, and a receiver that listens to the microphone and paints the picture as the tones arrive. Success is the moment the receiving screen visibly fills in from silence while the sound is still playing.

## Positioning

Encoding and decoding happen in the same browser tab, in real time, with no recording step and no server. It uses real SSTV modes (Robot 36, Martin M1/M2, Scottie S1/S2), so its signal is interoperable with ham-radio SSTV apps.

## Operating Context

A room with ambient noise, laptop speakers, phone mics. Browser microphone permission. Audio processing must be off (no echo cancellation, noise suppression, auto gain) or the tones are destroyed. Single-device use relies on a digital loopback path.

## Capabilities and Constraints

- Transmit: pick or drop an image, crop to the mode's frame, play it as audio, export as WAV.
- Receive: live microphone decode with VIS header auto-detection, per-line sync tracking, save decoded image as PNG.
- Loopback: transmit straight into the receiver inside the app.
- Decode an audio file.
- Analog: decoded images are approximate; noise shows as noise. That is honest behaviour, not a bug.

## Brand Commitments

Name: Earshot.

## Evidence on Hand

No real testimonials, users, or benchmarks exist. Sample images used in the app are authored test cards, labelled as such.

## Product Principles

1. The signal is the show: always let people see and hear what is happening.
2. Works on the first try in a noisy room, or says exactly why not.
3. Nothing leaves the device.
