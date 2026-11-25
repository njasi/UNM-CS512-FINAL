# UNM CS512 Final Project

## Assignment Requirements
The final project is a team project that requires you to demonstrate and utilize the techniques covered in this course. Each team must consist of at least 4 students (4-6) from the class. It is highly recommended to team up with students in the same course section (CS 412 students with CS 412 students, and CS 512 students with CS 512 students). This makes grading more consistent, since CS 512 projects are held to higher expectations. You might want to form your teams as early as possible to ensure sufficient time for collaboration and development. 
Team Formation and Presentation Slot (3 pts)

By the end of Nov 20, one team member in each team must:

        Email the names of all team members to the instructor at zhuwang@unm.edu.
        Sign up for a 15-minute presentation slot on Dec 1 or Dec 3 (depending on the availability).

Technical Implementation (5 pts)

    Your project must apply concepts from this course, specifically topics from hierarchical modeling onward. You do not need to use every topic. An interesting, well-designed scene matters more than covering everything.
    Projects with more advanced implementations will generally score higher than those with lower technical complexity.
    If you attempt ray tracing or other advanced rendering techniques, your project will be graded with a more flexible standard across all criteria, including interactivity and creativity, to account for the added difficulty.
    Each team member’s implementation work should be equivalent to at least two homework assignments.
    Your project must be hosted online (for example, on GitHub Pages). Anyone with internet access should be able to open the URL and see your WebGL canvas directly, not a folder or a GitHub repository.

Interactivity and Animation (3 pts)

The project must include both:

    Meaningful interaction, such as user controls or adjustable parameters.
    Animation, such as dynamic behaviors, scene changes, or game-like experiences.

Creative Design and Visual Appeal (3 pts)

    Show originality in your project idea, visual design, and overall experience.
    If your idea builds on a homework assignment, it must include significant improvements on top of the original.

Presentation (5 pts)

    Each team has 15 minutes: 10 minutes for the presentation and 5 minutes for Q&A.
    You must run a live demo of your project, whether or not you also use slides.
    Every team member must present and will be asked questions during Q&A.
    Contributions should be balanced. Each member is expected to complete roughly 20% or more of the total workload, and grades may differ between members if contributions are uneven.

Team Project Report and Peer Evaluation (6 pts)

This section has two parts: one report per team (4 pts) and one peer evaluation per student (2 pts).

1. Team Report (4 pts)

Each team submits only one report describing the project as it stands at submission. If some features are incomplete, briefly describe what works and what doesn’t.

Length: 8 pages maximum. A complete report is typically more than 4 pages in 12-point font, single-column format.

Format: PDF. No other formatting requirements. Screenshots, diagrams, tables, and equations are welcome.

Your report must include:

    The public URL of your project
    Technical methods used
    Challenges you encountered
    Instructions for interacting with or playing your project
    A detailed description of each team member’s contribution
    A disclosure of any AI assistance used for supportive tasks, such as looking up color values or syntax (similar to using a search engine or reference book)

Optional: design decisions, behind-the-scenes stories, or other insights.

2. Individual Peer Evaluation (2 pts)

Each student completes the peer evaluation form individually and submits it on Canvas by the project deadline. Responses are confidential and will not be shared with your teammates. 

Final Project Peer Evaluation.docx
Bonus Points (up to +3)

    +1 if your team is formed and reported to the instructor by the end of Nov 6.
    up to 2 for outstanding projects.

Submission

    Submit your project code and report together on Canvas as a single zip file named <name1>-<name2>-<name3>-<name4>-final project.zip. Incorrect submissions lose 1 point.
    One person per team needs to submit the team report and code, along with their own peer evaluation form. The rest of the team only need to submit their own peer evaluation forms separately.  All submissions are due Dec 8. If multiple members submit, the latest submission counts as the team’s submission.
    Late penalty: 5 points are deducted as soon as the deadline passes (even 1 second late), plus 5 more points for each additional 24 hours.


## Files of interest to the grader

## Development

```sh
npm i
npm run start
```

## Production Build
```sh
git checkout gh-pages
rm -rf ./dist
npm run build
```
