# Neural Networks Data CLI
> For Queen's CMPE 452

## Getting Started

```bash
npm install -g nn-project
```

## Usage

```
  prep [options] <path | file>
  
    path | file             A path to a CSV or a CSV filename to load into the normalizer
    
  Options:
      
    -h, --help                          Output usage information
    -c, --csv                           Output normalized data as a CSV (default)
    -j, --json                          Output normalized data as a JSON
    -o FILE, -output=FILE               The filename for the normalized data. NOTE: The output type file extension will be appended to the supplied filename. (defaults to <INPUT_FILE>.normalized.<EXTENSION>)
    --moving-averages=AVG_1,...,AVG_N   The moving averages to use. (defaults to 5,50,100,200)
    
  Examples:
  
  - Prepare a CSV referenced by a relative path
  
    $ prep my-data.csv
    
  - Prepare a CSV referenced by a relative path
  
    $ prep /Users/Me/Documents/my-data.csv
    
  - Specify output to be JSON
  
    $ prep --json my-data.csv
    
  - Specify an output path
  
    $ prep -o my-normalized-data.csv my-data.csv
    
    or
    
    $ prep --output="/Users/Me/Documents/my-normalized-data.csv" my-data.csv
  
  - Specify custom moving averages
  
    $ prep --moving-averages="2,3,4,5" my-data.csv
 
```

## License

MIT &copy; [Zack Harley](https://github.com/zackharley)
