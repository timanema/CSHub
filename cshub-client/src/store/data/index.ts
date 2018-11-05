import {dataStateGetter, dataStoreBuilder} from "./state";
import {hasConnection, searchQuery, topics} from "./getters";
import {setConnection, setSearchQuery, setTopics} from "./mutations";

const dataState = {
    get state() { return dataStateGetter(); },

    get topics() { return topics(); },
    get hasConnection() { return hasConnection(); },
    get searchQuery() { return searchQuery(); },

    setConnection: dataStoreBuilder.commit(setConnection),
    setTopics: dataStoreBuilder.commit(setTopics),
    setSearchQuery: dataStoreBuilder.commit(setSearchQuery)

};

export default dataState;
