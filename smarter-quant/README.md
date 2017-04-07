# Smarter TS quantization

## Flexible timestamps

Allowing timestamp quantization to be expressed in absolute numbers
instead of seconds/hours/days/etc gives users more control and opens
up the possibility of better supporting timestamp increments other
than one millisecond.

To do that, we would also need:

* Arbitrary zero point
    * Probably expressed as offset from UNIX epoch in seconds
* Size of increment
    * Power of 10 adjustment to seconds if negative
    * Number of seconds if positive
    * 0 and 1 would thus be equivalent

So today's `quantum(time, 1, 's')` would be equivalent to a more
powerful function definition `quantum(time, 1000, 0, -3)`:

* `time` as column name
* `1000` as number of units per quantum
* `0` as offset from epoch
* `-3` indicates each unit is `10^-3` seconds, or 1ms.

### Problem: client coordination

It's not clear how to communicate these details to clients for
converting timestamp values into strings or for converting strings
into timestamps. (The latter is only relevant when using `put`
functionality via PB/TTB; `insert` requests via our SQL-esque `query`
interface are converted on the server side.)

Out of band communication might work, via `describe` functionality or
similar.

## Geolocation

Latitude & longitude should be integers; we have no interest in
quantizing real numbers and dealing with the inaccuracies inherent
therein.

See http://nsidc.org/data/ease/tools.html for an example of data provided as integers:

> These geolocation files contain flat, binary arrays of 4-byte integers containing the latitude or longitude of the respective grid cell in hundred-thousandth degrees. The user should divide the stored integer value by 100,000. to yield decimal degrees, with 1 meter precision. The user is expected to know which byte-ordering convention is required by their system. Files are provided in PC (little-endian/LSB) byte orders.

> Depending on the coverage area, which varies for different grids (such as ML, NH, SL, Sa25 and so on), scaled latitudes range from -90.00000 to 90.00000, and scaled longitudes range from -180.00000 to 180.00000 with missing data (such as corners of grids with hemispheric coverage) indicated by scaled value 14316.55765.

If we stash two signed 4-byte integers for latitude and longitude in a
8-byte space we use for integers and timestamps we have a range
between -2,147,483,647 and 2,147,483,647. Divide that by the maximum
longitude (180º) to get a potential division factor of 10 million, not
the 100k used by the data described above (although I suspect that's a
typo on their part, and the actual value is 1 million).

That should get us 6 digits of precision after the decimal point,
which per https://en.wikipedia.org/wiki/Decimal_degrees gives us a
precision of ~0.1m. I've been unable to determine whether high value
applications such as oil surveying require greater precision.

We should be able to allow for quantization based on just one
dimension as long as we provide a way for the schema to know whether
it's latitude or longitude that should be captured at the high end of
the 8-byte integer.

Alternatively, we could allow quantization on two integers, allowing
8-digit precision and making the single-dimension quantization problem
easier.

### Altitude?

Should also consider whether we need to include a 3rd dimension for
quantization and how that could be achieved.
