Error1:
i was in the work tab, and wanted to delete a work, and i got the following error: DELETE https://drn8tyjw93.execute-api.us-east-1.amazonaws.com/prod/works/work_1761679460300_46dyur54c 404 (Not Found)
apiCall @ (index):2449
deleteWork @ (index):4479
onclick @ (index):1Understand this error
(index):2453 HTTP error! status: 404, response: {"error":true,"message":"Work not found","timestamp":"2025-10-28T19:25:18.120Z"}
apiCall @ (index):2453
await in apiCall
deleteWork @ (index):4479
onclick @ (index):1Understand this error
(index):2461 API call failed: Error: HTTP error! status: 404
    at apiCall ((index):2454:27)
    at async deleteWork ((index):4479:17)
apiCall @ (index):2461
await in apiCall
deleteWork @ (index):4479
onclick @ (index):1Understand this error
(index):4495 Error deleting work: Error: HTTP error! status: 404
    at apiCall ((index):2454:27)
    at async deleteWork ((index):4479:17)

Error2: 
    Im in the contractor tab and clicked on a work, and the information about Total amount of paiments, amount of expences, expences paid, and waiting expences in not showing the correct data.
    I have found the same issue in the work tab when you are clicking on a work.
    The same issue is also found in the project tab, the information about the project is not updated (amount of expences, amount of contractors, total amount, etc)


Error 3:
Im in the work tab, and the information project name (assosiated project), and contractor name are filled with "undefined" marks.
also in the project tab, the name of the project is Undefined.

