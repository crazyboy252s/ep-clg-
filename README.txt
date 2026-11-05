ATTENDAI WEB APP — VITE-READY SOURCE

This is the updated AttendAI project. It starts with your 13 subjects, imported attendance totals (300 present / 384 counted = 78.1%), and the corrected Vignan Section 10 CSE timetable.

RUN LOCALLY
1. Install Node.js LTS (https://nodejs.org/)
2. Open this folder in VS Code.
3. Open Terminal and run: npm install
4. Run: npm run dev
5. Open the local URL shown by Vite.

This folder is a static web app and can be run without a framework build step: use `npx vite --host 0.0.0.0` after installing Vite, or follow the package.json scripts.

ATTENDANCE LOGIC
- Previous totals are stored in baseline; new daily marks are stored separately.
- Attendance = present / (present + absent) * 100. Cancelled and unmarked periods are excluded.
- Simulator projects the result after any number of upcoming attended and bunked classes.
- SAFE: >=75%; WARNING: 60% to 74.9%; DANGER: <60%.
- The target percentage is editable in Settings. Warning and danger thresholds remain 75% and 60%.

TIMETABLE
- Monday through Saturday are preloaded from the supplied timetable.
- Double periods are counted as two periods. Thursday's last slot is LALG (T), as confirmed by the user.
- Practical/lab entries use the corresponding lab subjects in the attendance report.

DATA
- Data is stored in browser localStorage on each device. It does not automatically sync across devices.
- Export a JSON backup regularly. The initial data is also included in initial-data.json.
