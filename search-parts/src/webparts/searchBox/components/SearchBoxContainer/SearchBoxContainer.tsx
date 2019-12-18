import * as React from                               'react';
import { ISearchBoxContainerProps } from             './ISearchBoxContainerProps';
import * as strings from                             'SearchBoxWebPartStrings';
import ISearchBoxContainerState from                 './ISearchBoxContainerState';
import { PageOpenBehavior, QueryPathBehavior } from  '../../../../helpers/UrlHelper';
import { MessageBar, MessageBarType } from           'office-ui-fabric-react/lib/MessageBar';
import Downshift from                                'downshift';
import { IconType, Icon } from                       'office-ui-fabric-react/lib/Icon';
import { TextField, ITextFieldProps } from           'office-ui-fabric-react/lib/TextField';
import { Spinner, SpinnerSize } from                 'office-ui-fabric-react/lib/Spinner';
import { Label } from                                'office-ui-fabric-react/lib/Label';
import * as update from                              'immutability-helper';
import styles from '../SearchBoxWebPart.module.scss';
import ISearchQuery from '../../../../models/ISearchQuery';
import NlpDebugPanel from '../NlpDebugPanel/NlpDebugPanel';
import { IconButton } from 'office-ui-fabric-react/lib/Button';
import { ISuggestion } from '../../../../models/ISuggestion';
import { isEqual, debounce } from '@microsoft/sp-lodash-subset';
import { SuggestionType } from '../../../../models/SuggestionType';
import { ISuggestionPerson } from '../../../../models/ISuggestionPerson';
import { ITheme } from '@uifabric/styling';

const SUGGESTION_CHAR_COUNT_TRIGGER = 2;

export default class SearchBoxContainer extends React.Component<ISearchBoxContainerProps, ISearchBoxContainerState> {

  private _onChangeDebounced = null;

  public constructor(props: ISearchBoxContainerProps) {

    super(props);

    this.state = {
      enhancedQuery: null,
      proposedQuerySuggestions: [],
      selectedQuerySuggestions: [],
      zeroTermQuerySuggestions: [],
      hasRetrievedZeroTermSuggestions: false,
      isRetrievingZeroTermSuggestions: false,
      isRetrievingSuggestions: false,
      searchInputValue: (props.inputValue) ? decodeURIComponent(props.inputValue) : '',
      termToSuggestFrom: null,
      errorMessage: null,
      showClearButton: !!props.inputValue,
      lastSuggestionClicked: null,
    };

    this._onSearch = this._onSearch.bind(this);
    this._onChange = this._onChange.bind(this);
    this._onQuerySuggestionSelected = this._onQuerySuggestionSelected.bind(this);
  }

  private renderSearchBoxWithAutoComplete(): JSX.Element {
    let clearButton = null;
    let thisComponent = this;

    if (this.state.showClearButton) {
      clearButton = <IconButton iconProps={{
                        theme: this.props.themeVariant as ITheme,
                        iconName: 'Clear',
                        iconType: IconType.default,
                      }} onClick= {() => { this._onChange(''); this._onSearch('', true); } } className={ styles.clearBtn }>
                    </IconButton>;
    }

    return <Downshift
        onSelect={ this._onQuerySuggestionSelected }
        itemToString={(item: ISuggestion) => item ? item.displayText : ''}
        >
        {({
          getInputProps,
          getItemProps,
          isOpen,
          selectedItem,
          highlightedIndex,
          openMenu,
          closeMenu,
          clearItems,
        }) => (
          <div>
            <div className={ styles.searchFieldGroup }>
              <TextField {...getInputProps({
                  placeholder: this.props.placeholderText ? this.props.placeholderText : strings.SearchInputPlaceholder,
                  theme: this.props.themeVariant as ITheme,
                  onKeyDown: event => {

                    if (!isOpen || (isOpen && highlightedIndex === null)) {
                      if (event.keyCode === 13) {
                        // Submit search on "Enter"
                        this._onSearch(this.state.searchInputValue);
                      }
                      else if (event.keyCode === 27) {
                        // Clear search on "Escape"
                        this._onSearch('', true);
                      }
                    }

                  }
              } as ITextFieldProps)}
              className={ styles.searchTextField }
              value={ this.state.searchInputValue }
              autoComplete= "off"
              onChange={ (evt, value) => {
                if (!this._onChangeDebounced) {
                  this._onChangeDebounced = debounce((newValue) => {
                    clearItems();
                    this._onChange(newValue);
                  }, 200);
                }
                this._onChangeDebounced(value);
                this.setState({
                  searchInputValue: value,
                  showClearButton: true,
                  isRetrievingSuggestions: this.props.enableQuerySuggestions,
                });
              }}
              onFocus={ () => {
                openMenu();
              }}
              onBlur = { () => {
                closeMenu();
              }}
              />
              {clearButton}
              <IconButton iconProps={{
                  theme: this.props.themeVariant as ITheme,
                  iconName: 'Search',
                  iconType: IconType.default,
                }} onClick= {() => { this._onSearch(this.state.searchInputValue);} } className={ styles.searchBtn }>
              </IconButton>
            </div>
            {isOpen ?
              this.renderSuggestions(getItemProps, selectedItem, highlightedIndex)
            : null}
          </div>
        )}
      </Downshift>;
  }

  private renderBasicSearchBox(): JSX.Element {
    var clearButton = null;
    if (this.state.showClearButton) {
      clearButton = <IconButton iconProps={{
                        iconName: 'Clear',
                        theme: this.props.themeVariant as ITheme,
                        iconType: IconType.default,
                      }} onClick= {() => { this._onSearch('', true); } } className={ styles.clearBtn }>
                    </IconButton>;
    }

    return  <div className={ styles.searchFieldGroup }>
              <TextField
                className={ styles.searchTextField }
                theme={this.props.themeVariant as ITheme}
                placeholder={ this.props.placeholderText ? this.props.placeholderText : strings.SearchInputPlaceholder }
                value={ this.state.searchInputValue }
                onChange={ (ev, value) => {
                  this.setState({
                    searchInputValue: value,
                    showClearButton: true
                  });
                }}
                onKeyDown={ (event) => {

                    if (event.keyCode === 13) {
                      // Submit search on "Enter"
                      this._onSearch(this.state.searchInputValue);
                    }
                    else if (event.keyCode === 27) {
                      // Clear search on "Escape"
                      this._onSearch('', true);
                    }

                }}
              />
              {clearButton}
              <IconButton iconProps={{
                  iconName: 'Search',
                  theme: this.props.themeVariant as ITheme,
                  iconType: IconType.default,
                }} onClick= {() => { this._onSearch(this.state.searchInputValue);} } className={ styles.searchBtn }>
              </IconButton>
            </div>;
  }

  /**
   * Renders the suggestions panel below the input control
   * @param getItemProps downshift getItemProps callback
   * @param selectedItem downshift selectedItem callback
   * @param highlightedIndex downshift highlightedIndex callback
   */
  private renderSuggestions(getItemProps, selectedItem, highlightedIndex): JSX.Element {

    let renderSuggestions: JSX.Element = null;

    // Edge case with SPFx
    // Only in Chrome/Firefox the parent element class ".Canvas-slideUpIn" create a new stacking context due to a 'transform' operation preventing the inner content to overlap other WP
    // We need to manually set a z-index on this element to render suggestions correctly above all content.
    try {
      const parentStackingContext = this.props.domElement.closest(".Canvas-slideUpIn");
      if (parentStackingContext) {
          parentStackingContext.classList.add(styles.parentStackingCtx);
      }
    } catch (error) {}

    if ((this.state.isRetrievingSuggestions && this.state.proposedQuerySuggestions.length === 0)
     || (this.state.isRetrievingZeroTermSuggestions && !this.state.searchInputValue))
    {
      renderSuggestions = <div className={styles.suggestionPanel}>
                            <div {...getItemProps({item: null, disabled: true})}>
                              <div className={styles.suggestionItem}>
                                <Spinner size={ SpinnerSize.small }/>
                              </div>
                            </div>
                          </div>;
    }

    if (this.state.proposedQuerySuggestions.length > 0) {

      const suggestionGroups = this.state.proposedQuerySuggestions.reduce<{[key: string]: { groupName: string, suggestions: { suggestion: ISuggestion, index: number }[] }}>((groups, suggestion, index) => {
          const groupName = suggestion && suggestion.groupName ? suggestion.groupName.trim() : strings.SuggestionProviders.DefaultSuggestionGroupName;
          if (!groups[groupName]) {
            groups[groupName] = {
              groupName,
              suggestions: []
            };
          }
          groups[groupName].suggestions.push({ suggestion, index });
          return groups;
      }, {});

      let indexIncrementer = -1;
      const renderedSuggestionGroups = Object.keys(suggestionGroups).map(groupName => {
        const currentGroup = suggestionGroups[groupName];
        const renderedSuggestions = currentGroup.suggestions.map(item => {
          indexIncrementer++;
          return this.renderSuggestion(item.suggestion, indexIncrementer, getItemProps, selectedItem, highlightedIndex);
        });

        return (
          <>
              <Label className={styles.suggestionGroupName}>{groupName}</Label>
              <div>
                {renderedSuggestions}
              </div>
          </>
        )
      })

      renderSuggestions = <div className={styles.suggestionPanel}>
                            { renderedSuggestionGroups }
                          </div>;
    }

    return renderSuggestions;
  }

  private renderSuggestion(suggestion: ISuggestion, suggestionIndex: number, getItemProps, selectedItem, highlightedIndex): JSX.Element {

    let suggestionInner: JSX.Element = null;
    let suggestionContent: JSX.Element = null;

    if (suggestion.type === SuggestionType.Person) {
      const personSuggestion = suggestion as ISuggestionPerson;
      const personFields = [];
      if (personSuggestion.jobTitle) personFields.push(personSuggestion.jobTitle);
      if (personSuggestion.emailAddress) personFields.push(personSuggestion.emailAddress);

      suggestionContent = <>
        <span dangerouslySetInnerHTML={{ __html: personSuggestion.displayText }}></span>
        <span className={styles.suggestionDescription}>{personFields.join(' | ')}</span>
      </>;
    }
    else {
      suggestionContent = <>
        <span dangerouslySetInnerHTML={{ __html: suggestion.displayText }}></span>
      </>;
    }

    suggestionInner = <>
      <div className={styles.suggestionIcon}>
        {suggestion.icon && <img src={suggestion.icon} />}
      </div>
      <div className={styles.suggestionContent}>
        {suggestionContent}
      </div>
      <div className={styles.suggestionAction}>
        {suggestion.targetUrl && (
          <Icon
            iconName='OpenInNewWindow'
            iconType={IconType.default}
          />
        )}
      </div>
    </>;

    const innerClassName = suggestionIndex === highlightedIndex ? `${styles.suggestionItem} ${styles.selected}` : `${styles.suggestionItem}`;

    return (
      <div {...getItemProps({ item: suggestion })}
        key={suggestionIndex}
        style={{
          fontWeight: selectedItem === suggestion ? 'bold' : 'normal'
        }}>
          {suggestion.targetUrl
            ? <a className={innerClassName}
                 href={suggestion.targetUrl}
                 target="_blank"
                 data-interception="off" // Bypass SPFx page router (https://docs.microsoft.com/en-us/sharepoint/dev/spfx/hyperlinking)
                 onClick={() => this.setState({ lastSuggestionClicked: suggestion })}
          >{suggestionInner}</a>
            : <div className={innerClassName}>{suggestionInner}</div>
          }
      </div>
    );
  }

  /**
   * Handler when a user enters new keywords in the search box input
   * @param inputValue
   */
  private async _onChange(inputValue: string) {

    if (this.props.enableQuerySuggestions) {

      if (inputValue && inputValue.length >= SUGGESTION_CHAR_COUNT_TRIGGER) {

        try {

          this.setState({
            isRetrievingSuggestions: true,
            errorMessage: null,
            proposedQuerySuggestions: [],
          });

          const allProviderPromises = this.props.suggestionProviders.map(async (provider) => {

            // Verify we have a valid suggestion provider and it is enabled
            if (provider && provider.providerEnabled && provider.instance.isSuggestionsEnabled) {
              const suggestions = await provider.instance.getSuggestions(inputValue);

              // Verify the input value hasn't changed before we add the returned suggestion
              if (!this.state.termToSuggestFrom || inputValue === this.state.searchInputValue) {
                this.setState({
                  proposedQuerySuggestions: this.state.proposedQuerySuggestions.concat(suggestions), // Merge suggestions
                  termToSuggestFrom: inputValue, // The term that was used as basis to get the suggestions from
                  isRetrievingSuggestions: false
                });
              }
            }

          });

          Promise.all(allProviderPromises).then(() => {
            this.setState({
              isRetrievingSuggestions: false
            })
          });

        } catch(error) {

          this.setState({
            errorMessage: error.message,
            proposedQuerySuggestions: [],
            isRetrievingSuggestions: false
          });
        }

      }
      else {

        try {

          //render zero term query suggestions
          if (this.state.hasRetrievedZeroTermSuggestions) {
            this.setState({
              proposedQuerySuggestions: this.state.zeroTermQuerySuggestions,
              isRetrievingSuggestions: false
            });
          }
          else {
            await this.ensureZeroTermQuerySuggestions();
          }
        } catch(error) {
          this.setState({
            errorMessage: error.message,
            proposedQuerySuggestions: [],
            isRetrievingSuggestions: false
          });
        }
      }

    }
    else {
      // Clear suggestions history
      if (this.state.proposedQuerySuggestions.length > 0) {
        this.setState({
          proposedQuerySuggestions: [],
        });
      }
    }
  }

  private async ensureZeroTermQuerySuggestions(forceUpdate: boolean = false): Promise<void> {
    if ((!this.state.hasRetrievedZeroTermSuggestions && !this.state.isRetrievingZeroTermSuggestions) || forceUpdate) {

      // Verify we have at least one suggestion provider that has isZeroTermSuggestionsEnabled
      if (this.props.suggestionProviders && this.props.suggestionProviders.some(sgp => sgp.instance && sgp.instance.isZeroTermSuggestionsEnabled)) {
        this.setState({
          zeroTermQuerySuggestions: [],
          isRetrievingZeroTermSuggestions: true,
        });

        const allZeroTermSuggestions = await Promise.all(this.props.suggestionProviders.map(async (provider): Promise<ISuggestion[]> => {
          let zeroTermSuggestions = [];

          // Verify we have a valid suggestion provider and it is enabled
          if (provider && provider.providerEnabled && provider.instance.isZeroTermSuggestionsEnabled) {
            zeroTermSuggestions = await provider.instance.getZeroTermSuggestions();
          }

          return zeroTermSuggestions;
        }));

        // Flatten two-dimensional array of zero term suggestions
        const mergedSuggestions = allZeroTermSuggestions.reduce((allSuggestions, suggestions) => allSuggestions.concat(suggestions), []);

        this.setState({
          hasRetrievedZeroTermSuggestions: true,
          isRetrievingZeroTermSuggestions: false,
          zeroTermQuerySuggestions: mergedSuggestions,
          proposedQuerySuggestions: !this.state.searchInputValue ? mergedSuggestions : this.state.proposedQuerySuggestions,
        });
      }
      else {
        this.setState({
          hasRetrievedZeroTermSuggestions: true,
        });
      }

    }
  }

  /**
   * Handler when a suggestion is selected in the dropdown
   * @param suggestion the suggestion value
   */
  private _onQuerySuggestionSelected(suggestion: ISuggestion) {

    const termToSuggestFromIndex = this.state.searchInputValue.indexOf(this.state.termToSuggestFrom);
    let replacedSearchInputvalue =  this._replaceAt(this.state.searchInputValue, termToSuggestFromIndex, suggestion.displayText);

    // Remove inenr HTML markup if there is
    replacedSearchInputvalue = replacedSearchInputvalue.replace(/(<B>|<\/B>)/g,"");

    // Check if our custom suggestion has a onSuggestionSelected handler
    if (suggestion.onSuggestionSelected) {
      try {
        suggestion.onSuggestionSelected(suggestion);
      }
      catch (error) {
        console.log(`Error occurred while executing custom onSuggestionSeleted() handler. ${error}`);
      }
    }

    if (!suggestion.targetUrl) {
      this.setState({
        searchInputValue: replacedSearchInputvalue,
        proposedQuerySuggestions:[],
        showClearButton: true,
        selectedQuerySuggestions: update(this.state.selectedQuerySuggestions, { $push: [suggestion]})
      }, () => {
        if (!suggestion.targetUrl) {
          this._onSearch(this.state.searchInputValue);
        }
      });
    }
    else {
      const lastSuggestionClicked = this.state.lastSuggestionClicked;
      if (!lastSuggestionClicked || (lastSuggestionClicked.targetUrl !== suggestion.targetUrl && lastSuggestionClicked.displayText !== suggestion.displayText)) {
        window.open(suggestion.targetUrl, '_blank');
      }
      this._onSearch('', true);
    }
  }

  private _replaceAt(string: string, index: number, replace: string) {
    return string.substring(0, index) + replace;
  }

  /**
   * Handler when a user enters new keywords
   * @param queryText The query text entered by the user
   */
  public async _onSearch(queryText: string, isReset: boolean = false) {

    // Don't send empty value
    if (queryText || isReset) {

      let query: ISearchQuery = {
        rawInputValue: queryText,
        enhancedQuery: ''
      };

      this.setState({
        searchInputValue: queryText,
        showClearButton: !isReset
      });

      if (this.props.enableNlpService && this.props.NlpService && queryText) {

        try {

          let enhancedQuery = await this.props.NlpService.enhanceSearchQuery(queryText, this.props.isStaging);
          query.enhancedQuery = enhancedQuery.enhancedQuery;

          enhancedQuery.entities.map((entity) => {
          });

          this.setState({
            enhancedQuery: enhancedQuery,
          });

        } catch (error) {

          // In case of failure, use the non-optimized query instead
          query.enhancedQuery = queryText;
        }
      }

      if (this.props.searchInNewPage && !isReset) {
        const urlEncodedQueryText = encodeURIComponent(queryText);

        const searchUrl = new URL(this.props.pageUrl);
        if (this.props.queryPathBehavior === QueryPathBehavior.URLFragment) {
          searchUrl.hash = urlEncodedQueryText;
        }
        else {
          searchUrl.searchParams.append(this.props.queryStringParameter, queryText);
        }

        // Send the query to the new page
        const behavior = this.props.openBehavior === PageOpenBehavior.NewTab ? '_blank' : '_self';
        window.open(searchUrl.href, behavior);

      } else {

        // Notify the dynamic data controller
        this.props.onSearch(query);
      }
    }
  }


  public UNSAFE_componentWillReceiveProps(nextProps: ISearchBoxContainerProps) {
    this.setState({
      searchInputValue: decodeURIComponent(nextProps.inputValue),
    });
  }

  public componentDidMount() {
    this.ensureZeroTermQuerySuggestions();
  }

  public componentDidUpdate(prevProps: ISearchBoxContainerProps) {
    // Detect if any of our suggestion providers have changed
    if (prevProps.suggestionProviders.length !== this.props.suggestionProviders.length
     || !isEqual(prevProps.suggestionProviders, this.props.suggestionProviders)) {
      this.ensureZeroTermQuerySuggestions(true);
    }
  }

  public render(): React.ReactElement<ISearchBoxContainerProps> {
    let renderErrorMessage: JSX.Element = null;

    const renderDebugInfos = this.props.enableNlpService && this.props.enableDebugMode ?
                              <NlpDebugPanel rawResponse={ this.state.enhancedQuery }/>:
                              null;

    if (this.state.errorMessage) {
      renderErrorMessage = <MessageBar messageBarType={ MessageBarType.error }
                                        dismissButtonAriaLabel='Close'
                                        isMultiline={ false }
                                        onDismiss={ () => {
                                          this.setState({
                                            errorMessage: null,
                                          });
                                        }}
                                        className={styles.errorMessage}>
                                        { this.state.errorMessage }</MessageBar>;
    }

    const renderSearchBox = this.props.enableQuerySuggestions ?
                          this.renderSearchBoxWithAutoComplete() :
                          this.renderBasicSearchBox();
    return (
      <div className={styles.searchBox}>
        { renderErrorMessage }
        { renderSearchBox }
        { renderDebugInfos }
      </div>
    );
  }
}
