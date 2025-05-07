declare module 'xterm-addon-search' {
  import { Terminal, ITerminalAddon } from 'xterm';

  export class Search implements ITerminalAddon {
    constructor();
    activate(terminal: Terminal): void;
    dispose(): void;
    findNext(term: string, searchOptions?: ISearchOptions): boolean;
    findPrevious(term: string, searchOptions?: ISearchOptions): boolean;
  }

  export interface ISearchOptions {
    regex?: boolean;
    wholeWord?: boolean;
    caseSensitive?: boolean;
    incremental?: boolean;
  }
}