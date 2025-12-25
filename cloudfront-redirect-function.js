function handler(event) {
    var request = event.request;
    var host = request.headers.host.value;

    // Redirect non-www to www
    if (host === 'builder-expenses.com') {
        var uri = request.uri;
        var querystring = request.querystring;
        var newUrl = 'https://www.builder-expenses.com' + uri;

        // Preserve query string if present
        if (querystring && Object.keys(querystring).length > 0) {
            var params = [];
            for (var key in querystring) {
                params.push(key + '=' + querystring[key].value);
            }
            newUrl += '?' + params.join('&');
        }

        return {
            statusCode: 301,
            statusDescription: 'Moved Permanently',
            headers: {
                'location': { value: newUrl }
            }
        };
    }

    // Pass through www requests unchanged
    return request;
}
