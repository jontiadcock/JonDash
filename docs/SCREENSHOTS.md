# A look around JonDash

Every screenshot below is a real instance with invented data — made-up people, made-up
services, made-up hostnames. **Click any image to open it full size.**

The demo has the optional [Health monitoring](https://github.com/jontiadcock/JonDash-addons)
module installed, which is why some pages mention it; a stock install has no modules at all.

---

## The dashboard

Each person signs in and gets their own grid of service tiles — icon, name, link. Nothing
else is on the page, because that is the whole job. Tiles come from **Service Groups** you
assign, plus any personal tiles you add for that one person.

<a href="images/dashboard.png"><img src="images/dashboard.png" width="100%" alt="The dashboard: a grid of service tiles, each with an icon and a name"></a>

## What a module adds

A module can put a **widget on the dashboard** and pages of its own, without changing the
base app. Here the Health monitoring module reports on everything it watches, and stays
quiet unless something needs attention.

<table>
<tr>
<td width="34%" valign="top">
<a href="images/health-widget.png"><img src="images/health-widget.png" width="100%" alt="The health widget on the dashboard, showing uptime bars for four services"></a>
</td>
<td width="66%" valign="top">
<a href="images/health-monitor.png"><img src="images/health-monitor.png" width="100%" alt="The health monitoring page listing every check with 24-hour uptime strips"></a>
</td>
</tr>
</table>

One check in detail — uptime over a day, a week and a month, response time, and every
outage it has recorded.

<a href="images/health-detail.png"><img src="images/health-detail.png" width="100%" alt="A single check: uptime statistics, a 24-hour status strip, a response-time chart, and a list of past outages"></a>

## Installing a module

Browse what a source publishes, tick what you want, and install several in one go. Every
module states what it can do **before** it is installed, in plain language — and anything
riskier than the ordinary is called out in red.

<table>
<tr>
<td width="50%" valign="top">
<a href="images/modules-browse.png"><img src="images/modules-browse.png" width="100%" alt="Browsing modules published by a source, each listing the permissions it requests"></a>
</td>
<td width="50%" valign="top">
<a href="images/module-consent.png"><img src="images/module-consent.png" width="100%" alt="The install confirmation, listing the permissions granted and warning that everyone will be signed out"></a>
</td>
</tr>
</table>

## Updates

**One page for everything that updates** — JonDash itself, every module, and the helpers
modules rely on. Nothing updates itself until you turn automatic updates on, and each item
can be excluded or put on the beta channel individually.

<a href="images/updates.png"><img src="images/updates.png" width="100%" alt="The Updates page: installed version, available updates, the automatic-updates switch, and per-item beta channel toggles"></a>

## Automatic HTTPS

Turn on **Let's Encrypt** and JonDash obtains a free certificate, renews it before it expires,
and redirects HTTP to HTTPS — no reverse proxy and no manual certificate wrangling. A
bring-your-own certificate works too, and either way it's off until you ask for it.

<a href="images/network-https.png"><img src="images/network-https.png" width="100%" alt="The Network & HTTPS page in Let's Encrypt mode, showing a valid, auto-renewed certificate"></a>

## Signing in

Password, then a code from an authenticator app. Recovery codes cover a lost phone.

<table>
<tr>
<td width="50%" valign="top">
<a href="images/login-2fa.png"><img src="images/login-2fa.png" width="100%" alt="The second step of signing in: a six-digit authenticator code"></a>
</td>
<td width="50%" valign="top">
<a href="images/account.png"><img src="images/account.png" width="100%" alt="The account page: change password, re-enrol authenticator, recovery codes, and active sessions"></a>
</td>
</tr>
</table>

## Running it

<table>
<tr>
<td width="50%" valign="top">
<a href="images/users.png"><img src="images/users.png" width="100%" alt="The users list showing access level, status, group count and tile count"></a>
<p><b>Users</b> — create an account and hand over a one-time setup link.</p>
</td>
<td width="50%" valign="top">
<a href="images/service-groups.png"><img src="images/service-groups.png" width="100%" alt="Service groups, each bundling a set of service tiles"></a>
<p><b>Service Groups</b> — bundle tiles once, assign to many people.</p>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="images/access-roles.png"><img src="images/access-roles.png" width="100%" alt="Access roles: named bundles of admin capabilities"></a>
<p><b>Access Roles</b> — delegate specific admin powers, not the lot.</p>
</td>
<td width="50%" valign="top">
<a href="images/sessions.png"><img src="images/sessions.png" width="100%" alt="Active sessions across all accounts, with device, location and last-active time"></a>
<p><b>Sessions</b> — see every signed-in device, revoke any of them.</p>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="images/audit.png"><img src="images/audit.png" width="100%" alt="The audit log, filterable by action and user, with background work marked System"></a>
<p><b>Audit log</b> — who did what, and what ran on its own.</p>
</td>
<td width="50%" valign="top">
<a href="images/backup.png"><img src="images/backup.png" width="100%" alt="Backup and restore: encrypted export, and a restore that lets you choose what to bring back"></a>
<p><b>Backup &amp; restore</b> — one file for the whole instance; pick what comes back.</p>
</td>
</tr>
</table>

---

[← Back to the README](../README.md)
