class RoutingError(Exception):
    pass


class OutOfServiceArea(RoutingError):
    pass


class SameLocation(RoutingError):
    pass


class NoRouteFound(RoutingError):
    pass
