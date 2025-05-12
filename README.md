# Data format translation program

## The task

Given are two files - both contain the same content - one is a CSV file the other is a PRN file,
we want you write a command line utility which will read these CSV files and PRN files from stdin and,
based on a command line option, print either JSON or HTML to stdout, so that it would work as part of a
command pipeline.

Input with differing formats (e.g. dates, currency) should produce identical output.
This means that irrespective of whether the input data format was CSV or PRN, the output should
be the same. There will be a check for differences in the evaluation.

Non ASCII characters should be handled and rendered correctly.

No content should be lost in translation and all output should be readable when encoded to UTF-8.

The solution will be tested like this

```
cat ./Workbook2.csv | your-solution csv html > csv.html.txt
cat ./Workbook2.prn | your-solution prn html > prn.html.txt
diff csv.html.txt prn.html.txt
cat ./Workbook2.csv | your-solution csv json > csv.json.txt
cat ./Workbook2.prn | your-solution prn json > prn.json.txt
diff csv.json.txt prn.json.txt
```

## How to proceed

Solution TS is required. Any open source libraries which make life easier for you are of course allowed.

## Assignment focus

1. The implemented solution should work correctly and be coded according to the instructions.
2. Solution architecture, code splitting, modularity, separation of concerns.
3. Testing approach and tests - be it unit, integration or e2e tests.
4. Type-safety in the context of the problem, data processing and data output.

## How to deliver

Upload the solution to GitHub, but **don't make PR to this repo. Send me the link / invite to the repository.**

Make regular commits and pushes, so that we can see the evolution of the solution.

## Deadline

You have 72 hours to complete the task. We reckon a couple of evenings should be enough.
