# Privacy Policy — SoundBridge

Last updated: January 2026

SoundBridge is a browser extension designed to help users download audio from YouTube videos directly into their self-hosted server media music library.

Your privacy is a core principle of this project.
SoundBridge is intentionally designed to be local-first, self-hosted, and free of tracking.

1. Data Collection

SoundBridge does NOT collect, store, sell, or share any personal data.

Specifically:

❌ No analytics

❌ No telemetry

❌ No tracking pixels

❌ No advertising identifiers

❌ No user profiling

2. Data Stored Locally

The extension stores a small amount of configuration data locally in the browser using chrome.storage:

API Base URL (user-defined, typically a local or VPN server)

API Key (used only to authenticate with the user’s own backend)

UI preferences (e.g. theme: dark/light)

This data:

Is stored only on the user’s device

Is never transmitted to third-party services

Can be removed at any time by uninstalling the extension or clearing browser storage

3. Network Requests

SoundBridge makes network requests only to:

The backend API explicitly configured by the user (usually on the local network or via VPN)

The extension never communicates with SoundBridge servers, because:

There are no SoundBridge servers

The project is fully self-hosted

SoundBridge does not send data to:

Google

YouTube

Analytics providers

Any external third-party endpoints

4. Authentication & Security

The API Key is used only to authenticate requests to the user’s own backend.

The API Key is never logged, shared, or transmitted elsewhere.

The backend is under full control of the user.

Users are responsible for securing their backend (e.g. LAN-only access, VPN, firewall rules).

5. Permissions Explanation

SoundBridge requests the following browser permissions:

storage
Used to save local configuration (API URL, API Key, UI preferences).

tabs
Used to read the URL of the currently active tab in order to detect YouTube videos.

host permissions (http://*/*, https://*/*)
Required to allow the extension to communicate with the backend API specified by the user.
The extension does not make requests to arbitrary websites beyond the user-configured endpoint.

No other permissions are requested.

6. Third-Party Services

SoundBridge does not integrate with or embed any third-party services.

Any interaction with YouTube or personal media server happens:

Indirectly

On the user’s infrastructure

Through tools and services configured and controlled by the user

7. Children’s Privacy

SoundBridge is not intended for use by children under the age of 13 and does not knowingly collect any information from children.

8. Open Source Transparency

SoundBridge is open source.

Users are encouraged to review the source code to verify:

How data is handled

What network requests are made

That no tracking or analytics are present

9. Changes to This Policy

This Privacy Policy may be updated to reflect changes in functionality or legal requirements.

Any changes will be documented in the project repository.

10. Contact

If you have questions or concerns about this Privacy Policy, you can contact the project maintainer via the GitHub repository:

Project: SoundBridge
Maintainer: Antonio Viola
Repository: https://github.com/xShys/SoundBridge