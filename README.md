# Khan Academy Scraper CLI

Simple command-line tool for scraping Khan Academy programs.

# Usage
Install with npm:
```bash
npm install -g khan-academy-scraper
```
Clone from Github:
```bash
git clone https://github.com/bhavjitChauhan/khan-academy-scraper.git
cd khan-academy-scraper
npm install
```
View arguments with `--help`
```
$ ka-scrape --help

Scrape Khan Academy programs.

Options:
  --version        Show version number                                 [boolean]
  --max, -m        Maximum number of programs scraped                   [number]
  --limit, -l      Number of programs to fetch per API request
                                                        [number] [default: 1000]
  --cursor, -c     Specify starting API cursor                          [string]
  --sort, -s       Program list to scrape
                  [choices: "recent", "hot", "contests", "top"] [default: "top"]
  --output, -o     File name to store programs in [string] [default: "programs"]
  --overwrite, -w  Overwrite any previous output file [boolean] [default: false]
  --verbose, -v    Run in verbose mode                [boolean] [default: false]
  -h, --help       Show help                                           [boolean]
```

# License
This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
